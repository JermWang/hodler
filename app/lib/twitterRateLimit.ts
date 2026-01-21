/**
 * Twitter API Rate Limiting & Budget Management
 * 
 * Basic Tier Limits (as of Jan 2026):
 * - Posts: 15,000 retrievals per month
 * - Users: 50,000 requests per month per user
 * - DMs: 75,000 requests per month per user
 * 
 * This module tracks API usage and prevents exceeding limits.
 */

import { getPool, hasDatabase } from "./db";

let ensuredSchema: Promise<void> | null = null;

async function ensureSchema(): Promise<void> {
  if (!hasDatabase()) return;
  if (ensuredSchema) return ensuredSchema;

  ensuredSchema = (async () => {
    const pool = getPool();
    await pool.query(`
      create table if not exists public.twitter_api_usage (
        month_key text not null,
        endpoint text not null,
        request_count bigint not null,
        last_updated_unix bigint not null,
        primary key (month_key, endpoint)
      );
      create table if not exists public.twitter_user_daily_usage (
        day_key text not null,
        wallet_pubkey text not null,
        endpoint text not null,
        request_count bigint not null,
        last_updated_unix bigint not null,
        primary key (day_key, wallet_pubkey, endpoint)
      );
    `);
  })().catch((e) => {
    ensuredSchema = null;
    throw e;
  });

  return ensuredSchema;
}

// Monthly limits for Basic tier
export const TWITTER_LIMITS = {
  POSTS_PER_MONTH: 15000,
  USERS_PER_MONTH: 50000,
  // Safety buffer - stop at 90% to avoid overage
  SAFETY_THRESHOLD: 0.9,
  // Per-user daily limits to prevent abuse
  USER_DAILY_AUTH_ATTEMPTS: 5,
  USER_DAILY_TWEET_LOOKUPS: 100,
} as const;

export type TwitterApiEndpoint = 
  | "tweets/search"
  | "users/me"
  | "users/lookup"
  | "users/tweets"
  | "oauth/token";

interface RateLimitStatus {
  endpoint: TwitterApiEndpoint;
  currentCount: number;
  monthlyLimit: number;
  remainingBudget: number;
  percentUsed: number;
  isBlocked: boolean;
  resetDate: Date;
}

/**
 * Get the current month key for tracking (YYYY-MM format)
 */
function getCurrentMonthKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Get today's date key for daily limits (YYYY-MM-DD format)
 */
function getTodayKey(): string {
  return new Date().toISOString().split("T")[0];
}

/**
 * Increment API usage counter
 */
export async function incrementApiUsage(
  endpoint: TwitterApiEndpoint,
  count: number = 1,
  walletPubkey?: string
): Promise<void> {
  if (!hasDatabase()) return;

  await ensureSchema();

  const pool = getPool();
  const monthKey = getCurrentMonthKey();
  const dayKey = getTodayKey();

  // Increment monthly counter
  await pool.query(
    `INSERT INTO public.twitter_api_usage (month_key, endpoint, request_count, last_updated_unix)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (month_key, endpoint) DO UPDATE SET
       request_count = twitter_api_usage.request_count + $3,
       last_updated_unix = $4`,
    [monthKey, endpoint, count, Math.floor(Date.now() / 1000)]
  );

  // If wallet provided, increment per-user daily counter
  if (walletPubkey) {
    await pool.query(
      `INSERT INTO public.twitter_user_daily_usage (day_key, wallet_pubkey, endpoint, request_count, last_updated_unix)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (day_key, wallet_pubkey, endpoint) DO UPDATE SET
         request_count = twitter_user_daily_usage.request_count + $4,
         last_updated_unix = $5`,
      [dayKey, walletPubkey, endpoint, count, Math.floor(Date.now() / 1000)]
    );
  }
}

/**
 * Get current API usage for an endpoint
 */
export async function getApiUsage(endpoint: TwitterApiEndpoint): Promise<RateLimitStatus> {
  const monthKey = getCurrentMonthKey();
  const now = new Date();
  const resetDate = new Date(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);

  // Determine monthly limit based on endpoint
  const monthlyLimit = endpoint.startsWith("users/") 
    ? TWITTER_LIMITS.USERS_PER_MONTH 
    : TWITTER_LIMITS.POSTS_PER_MONTH;

  if (!hasDatabase()) {
    return {
      endpoint,
      currentCount: 0,
      monthlyLimit,
      remainingBudget: monthlyLimit,
      percentUsed: 0,
      isBlocked: false,
      resetDate,
    };
  }

  await ensureSchema();

  const pool = getPool();
  const isUsersEndpoint = endpoint.startsWith("users/");
  const result = await pool.query(
    isUsersEndpoint
      ? `SELECT COALESCE(SUM(request_count), 0) AS request_count
         FROM public.twitter_api_usage
         WHERE month_key = $1 AND endpoint LIKE 'users/%'`
      : `SELECT request_count FROM public.twitter_api_usage
         WHERE month_key = $1 AND endpoint = $2`,
    isUsersEndpoint ? [monthKey] : [monthKey, endpoint]
  );

  const currentCount = Number(result.rows[0]?.request_count || 0);
  const safeLimit = Math.floor(monthlyLimit * TWITTER_LIMITS.SAFETY_THRESHOLD);
  const remainingBudget = Math.max(0, safeLimit - currentCount);
  const percentUsed = (currentCount / monthlyLimit) * 100;
  const isBlocked = currentCount >= safeLimit;

  return {
    endpoint,
    currentCount,
    monthlyLimit,
    remainingBudget,
    percentUsed,
    isBlocked,
    resetDate,
  };
}

/**
 * Check if we can make an API call (respects budget)
 */
export async function canMakeApiCall(
  endpoint: TwitterApiEndpoint,
  estimatedCalls: number = 1
): Promise<{ allowed: boolean; reason?: string; status: RateLimitStatus }> {
  const status = await getApiUsage(endpoint);

  if (status.isBlocked) {
    return {
      allowed: false,
      reason: `Monthly API budget exhausted for ${endpoint}. Resets on ${status.resetDate.toISOString().split("T")[0]}`,
      status,
    };
  }

  if (status.remainingBudget < estimatedCalls) {
    return {
      allowed: false,
      reason: `Insufficient API budget. Need ${estimatedCalls}, have ${status.remainingBudget} remaining`,
      status,
    };
  }

  return { allowed: true, status };
}

/**
 * Check per-user daily limits (abuse prevention)
 */
export async function checkUserDailyLimit(
  walletPubkey: string,
  endpoint: TwitterApiEndpoint
): Promise<{ allowed: boolean; reason?: string; currentCount: number; limit: number }> {
  const dayKey = getTodayKey();

  // Determine daily limit based on endpoint
  const limit = endpoint === "oauth/token" 
    ? TWITTER_LIMITS.USER_DAILY_AUTH_ATTEMPTS
    : TWITTER_LIMITS.USER_DAILY_TWEET_LOOKUPS;

  if (!hasDatabase()) {
    return { allowed: true, currentCount: 0, limit };
  }

  await ensureSchema();

  const pool = getPool();
  const result = await pool.query(
    `SELECT request_count FROM public.twitter_user_daily_usage 
     WHERE day_key = $1 AND wallet_pubkey = $2 AND endpoint = $3`,
    [dayKey, walletPubkey, endpoint]
  );

  const currentCount = Number(result.rows[0]?.request_count || 0);

  if (currentCount >= limit) {
    return {
      allowed: false,
      reason: `Daily limit reached for ${endpoint}. Try again tomorrow.`,
      currentCount,
      limit,
    };
  }

  return { allowed: true, currentCount, limit };
}

/**
 * Get overall API budget status
 */
export async function getBudgetStatus(): Promise<{
  posts: RateLimitStatus;
  users: RateLimitStatus;
  overallHealthy: boolean;
  warnings: string[];
}> {
  const posts = await getApiUsage("tweets/search");
  const users = await getApiUsage("users/me");

  const warnings: string[] = [];

  if (posts.percentUsed > 75) {
    warnings.push(`Posts API at ${posts.percentUsed.toFixed(1)}% of monthly limit`);
  }
  if (users.percentUsed > 75) {
    warnings.push(`Users API at ${users.percentUsed.toFixed(1)}% of monthly limit`);
  }

  return {
    posts,
    users,
    overallHealthy: !posts.isBlocked && !users.isBlocked && warnings.length === 0,
    warnings,
  };
}

/**
 * Calculate optimal batch size for tweet tracking based on remaining budget
 */
export function calculateOptimalBatchSize(
  remainingBudget: number,
  daysLeftInMonth: number,
  activeCampaigns: number
): number {
  if (daysLeftInMonth <= 0 || activeCampaigns <= 0) return 0;

  // Reserve some budget for user auth and other operations
  const reservedBudget = Math.min(1000, remainingBudget * 0.1);
  const trackingBudget = remainingBudget - reservedBudget;

  // Distribute evenly across remaining days and campaigns
  const dailyBudget = Math.floor(trackingBudget / daysLeftInMonth);
  const perCampaignBudget = Math.floor(dailyBudget / activeCampaigns);

  // Each search returns up to 100 tweets, so budget = number of API calls
  // Minimum 1 call per campaign per day, maximum 10
  return Math.max(1, Math.min(10, perCampaignBudget));
}

/**
 * Get days remaining in current month
 */
export function getDaysRemainingInMonth(): number {
  const now = new Date();
  const lastDay = new Date(now.getUTCFullYear(), now.getUTCMonth() + 1, 0);
  return lastDay.getUTCDate() - now.getUTCDate() + 1;
}

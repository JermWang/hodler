/**
 * AmpliFi Campaign Store
 * 
 * Database operations for campaigns, epochs, and engagement tracking.
 */

import { getPool, hasDatabase } from "./db";
import crypto from "crypto";

export interface Campaign {
  id: string;
  projectPubkey: string;
  tokenMint: string;
  name: string;
  description?: string;
  totalFeeLamports: bigint;
  platformFeeLamports: bigint;
  rewardPoolLamports: bigint;
  startAtUnix: number;
  endAtUnix: number;
  epochDurationSeconds: number;
  minTokenBalance: bigint;
  weightLikeBps: number;
  weightRetweetBps: number;
  weightReplyBps: number;
  weightQuoteBps: number;
  trackingHandles: string[];
  trackingHashtags: string[];
  trackingUrls: string[];
  status: "active" | "paused" | "ended" | "cancelled";
  createdAtUnix: number;
  updatedAtUnix: number;
}

export interface Epoch {
  id: string;
  campaignId: string;
  epochNumber: number;
  startAtUnix: number;
  endAtUnix: number;
  rewardPoolLamports: bigint;
  distributedLamports: bigint;
  totalEngagementPoints: number;
  participantCount: number;
  status: "active" | "settling" | "settled";
  settledAtUnix?: number;
  createdAtUnix: number;
}

export interface CampaignParticipant {
  campaignId: string;
  walletPubkey: string;
  registrationId: string;
  tokenBalanceSnapshot: bigint;
  optedInAtUnix: number;
  optedOutAtUnix?: number;
  status: "active" | "opted_out" | "suspended";
}

export interface EngagementEvent {
  id: string;
  campaignId: string;
  epochId: string;
  walletPubkey: string;
  registrationId: string;
  tweetId: string;
  tweetType: string;
  tweetText?: string;
  tweetCreatedAtUnix: number;
  referencedHandle?: string;
  referencedHashtag?: string;
  referencedUrl?: string;
  parentTweetId?: string;
  basePoints: number;
  balanceWeight: number;
  timeConsistencyBonus: number;
  antiSpamDampener: number;
  finalScore: number;
  isDuplicate: boolean;
  isSpam: boolean;
  spamReason?: string;
  indexedAtUnix: number;
  createdAtUnix: number;
}

/**
 * Create a new campaign
 */
export async function createCampaign(params: {
  projectPubkey: string;
  tokenMint: string;
  name: string;
  description?: string;
  totalFeeLamports: bigint;
  startAtUnix: number;
  endAtUnix: number;
  epochDurationSeconds?: number;
  minTokenBalance?: bigint;
  weightLikeBps?: number;
  weightRetweetBps?: number;
  weightReplyBps?: number;
  weightQuoteBps?: number;
  trackingHandles?: string[];
  trackingHashtags?: string[];
  trackingUrls?: string[];
}): Promise<Campaign> {
  if (!hasDatabase()) throw new Error("Database not available");
  
  const pool = getPool();
  const nowUnix = Math.floor(Date.now() / 1000);
  const id = crypto.randomUUID();

  // 50/50 fee split
  const platformFeeLamports = params.totalFeeLamports / 2n;
  const rewardPoolLamports = params.totalFeeLamports - platformFeeLamports;

  const campaign: Campaign = {
    id,
    projectPubkey: params.projectPubkey,
    tokenMint: params.tokenMint,
    name: params.name,
    description: params.description,
    totalFeeLamports: params.totalFeeLamports,
    platformFeeLamports,
    rewardPoolLamports,
    startAtUnix: params.startAtUnix,
    endAtUnix: params.endAtUnix,
    epochDurationSeconds: params.epochDurationSeconds || 86400, // Default: daily
    minTokenBalance: params.minTokenBalance || 0n,
    weightLikeBps: params.weightLikeBps || 1000,
    weightRetweetBps: params.weightRetweetBps || 3000,
    weightReplyBps: params.weightReplyBps || 5000,
    weightQuoteBps: params.weightQuoteBps || 6000,
    trackingHandles: params.trackingHandles || [],
    trackingHashtags: params.trackingHashtags || [],
    trackingUrls: params.trackingUrls || [],
    status: "active",
    createdAtUnix: nowUnix,
    updatedAtUnix: nowUnix,
  };

  await pool.query(
    `INSERT INTO public.campaigns 
     (id, project_pubkey, token_mint, name, description, total_fee_lamports,
      platform_fee_lamports, reward_pool_lamports, start_at_unix, end_at_unix,
      epoch_duration_seconds, min_token_balance, weight_like_bps, weight_retweet_bps,
      weight_reply_bps, weight_quote_bps, tracking_handles, tracking_hashtags,
      tracking_urls, status, created_at_unix, updated_at_unix)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)`,
    [
      campaign.id,
      campaign.projectPubkey,
      campaign.tokenMint,
      campaign.name,
      campaign.description,
      campaign.totalFeeLamports.toString(),
      campaign.platformFeeLamports.toString(),
      campaign.rewardPoolLamports.toString(),
      campaign.startAtUnix,
      campaign.endAtUnix,
      campaign.epochDurationSeconds,
      campaign.minTokenBalance.toString(),
      campaign.weightLikeBps,
      campaign.weightRetweetBps,
      campaign.weightReplyBps,
      campaign.weightQuoteBps,
      campaign.trackingHandles,
      campaign.trackingHashtags,
      campaign.trackingUrls,
      campaign.status,
      campaign.createdAtUnix,
      campaign.updatedAtUnix,
    ]
  );

  // Create initial epochs
  await createEpochsForCampaign(campaign);

  return campaign;
}

/**
 * Create epochs for a campaign based on duration
 */
async function createEpochsForCampaign(campaign: Campaign): Promise<void> {
  const pool = getPool();
  const nowUnix = Math.floor(Date.now() / 1000);

  let epochStart = campaign.startAtUnix;
  let epochNumber = 1;

  while (epochStart < campaign.endAtUnix) {
    const epochEnd = Math.min(
      epochStart + campaign.epochDurationSeconds,
      campaign.endAtUnix
    );

    const epochId = crypto.randomUUID();
    
    // Calculate reward pool for this epoch (proportional to duration)
    const totalDuration = campaign.endAtUnix - campaign.startAtUnix;
    const epochDuration = epochEnd - epochStart;
    const epochRewardPool = (campaign.rewardPoolLamports * BigInt(epochDuration)) / BigInt(totalDuration);

    await pool.query(
      `INSERT INTO public.epochs 
       (id, campaign_id, epoch_number, start_at_unix, end_at_unix, reward_pool_lamports,
        distributed_lamports, total_engagement_points, participant_count, status, created_at_unix)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        epochId,
        campaign.id,
        epochNumber,
        epochStart,
        epochEnd,
        epochRewardPool.toString(),
        "0",
        0,
        0,
        epochStart <= nowUnix && epochEnd > nowUnix ? "active" : "active",
        nowUnix,
      ]
    );

    epochStart = epochEnd;
    epochNumber++;
  }
}

/**
 * Get campaign by ID
 */
export async function getCampaignById(id: string): Promise<Campaign | null> {
  if (!hasDatabase()) return null;
  
  const pool = getPool();
  const result = await pool.query(
    `SELECT * FROM public.campaigns WHERE id = $1`,
    [id]
  );

  if (result.rows.length === 0) return null;

  return rowToCampaign(result.rows[0]);
}

/**
 * Get active campaigns
 */
export async function getActiveCampaigns(): Promise<Campaign[]> {
  if (!hasDatabase()) return [];
  
  const pool = getPool();
  const nowUnix = Math.floor(Date.now() / 1000);
  
  const result = await pool.query(
    `SELECT * FROM public.campaigns 
     WHERE status = 'active' AND start_at_unix <= $1 AND end_at_unix > $1
     ORDER BY created_at_unix DESC`,
    [nowUnix]
  );

  return result.rows.map(rowToCampaign);
}

/**
 * Get current epoch for a campaign
 */
export async function getCurrentEpoch(campaignId: string): Promise<Epoch | null> {
  if (!hasDatabase()) return null;
  
  const pool = getPool();
  const nowUnix = Math.floor(Date.now() / 1000);
  
  const result = await pool.query(
    `SELECT * FROM public.epochs 
     WHERE campaign_id = $1 AND start_at_unix <= $2 AND end_at_unix > $2
     ORDER BY epoch_number DESC LIMIT 1`,
    [campaignId, nowUnix]
  );

  if (result.rows.length === 0) return null;

  return rowToEpoch(result.rows[0]);
}

/**
 * Get epochs ready for settlement
 */
export async function getEpochsReadyForSettlement(): Promise<Epoch[]> {
  if (!hasDatabase()) return [];
  
  const pool = getPool();
  const nowUnix = Math.floor(Date.now() / 1000);
  
  const result = await pool.query(
    `SELECT * FROM public.epochs 
     WHERE status = 'active' AND end_at_unix <= $1
     ORDER BY end_at_unix ASC`,
    [nowUnix]
  );

  return result.rows.map(rowToEpoch);
}

/**
 * Record engagement event
 */
export async function recordEngagementEvent(event: Omit<EngagementEvent, "id" | "indexedAtUnix">): Promise<EngagementEvent> {
  if (!hasDatabase()) throw new Error("Database not available");
  
  const pool = getPool();
  const nowUnix = Math.floor(Date.now() / 1000);
  const id = crypto.randomUUID();

  const fullEvent: EngagementEvent = {
    ...event,
    id,
    indexedAtUnix: nowUnix,
  };

  await pool.query(
    `INSERT INTO public.engagement_events 
     (id, campaign_id, epoch_id, wallet_pubkey, registration_id, tweet_id, tweet_type,
      tweet_text, tweet_created_at_unix, referenced_handle, referenced_hashtag,
      referenced_url, parent_tweet_id, base_points, balance_weight, time_consistency_bonus,
      anti_spam_dampener, final_score, is_duplicate, is_spam, spam_reason, indexed_at_unix, created_at_unix)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
     ON CONFLICT (campaign_id, tweet_id) DO NOTHING`,
    [
      fullEvent.id,
      fullEvent.campaignId,
      fullEvent.epochId,
      fullEvent.walletPubkey,
      fullEvent.registrationId,
      fullEvent.tweetId,
      fullEvent.tweetType,
      fullEvent.tweetText,
      fullEvent.tweetCreatedAtUnix,
      fullEvent.referencedHandle,
      fullEvent.referencedHashtag,
      fullEvent.referencedUrl,
      fullEvent.parentTweetId,
      fullEvent.basePoints,
      fullEvent.balanceWeight,
      fullEvent.timeConsistencyBonus,
      fullEvent.antiSpamDampener,
      fullEvent.finalScore,
      fullEvent.isDuplicate,
      fullEvent.isSpam,
      fullEvent.spamReason,
      fullEvent.indexedAtUnix,
      fullEvent.createdAtUnix,
    ]
  );

  return fullEvent;
}

/**
 * Get engagement history for a holder in an epoch
 */
export async function getHolderEngagementHistory(
  campaignId: string,
  walletPubkey: string,
  epochId?: string
): Promise<EngagementEvent[]> {
  if (!hasDatabase()) return [];
  
  const pool = getPool();
  
  let query = `SELECT * FROM public.engagement_events 
               WHERE campaign_id = $1 AND wallet_pubkey = $2`;
  const params: any[] = [campaignId, walletPubkey];
  
  if (epochId) {
    query += ` AND epoch_id = $3`;
    params.push(epochId);
  }
  
  query += ` ORDER BY created_at_unix DESC`;
  
  const result = await pool.query(query, params);

  return result.rows.map(rowToEngagementEvent);
}

/**
 * Add participant to campaign
 */
export async function addCampaignParticipant(params: {
  campaignId: string;
  walletPubkey: string;
  registrationId: string;
  tokenBalanceSnapshot: bigint;
}): Promise<void> {
  if (!hasDatabase()) throw new Error("Database not available");
  
  const pool = getPool();
  const nowUnix = Math.floor(Date.now() / 1000);

  await pool.query(
    `INSERT INTO public.campaign_participants 
     (campaign_id, wallet_pubkey, registration_id, token_balance_snapshot, opted_in_at_unix, status)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (campaign_id, wallet_pubkey) DO UPDATE SET
       token_balance_snapshot = EXCLUDED.token_balance_snapshot,
       status = 'active',
       opted_out_at_unix = NULL`,
    [
      params.campaignId,
      params.walletPubkey,
      params.registrationId,
      params.tokenBalanceSnapshot.toString(),
      nowUnix,
      "active",
    ]
  );
}

/**
 * Get campaign participants
 */
export async function getCampaignParticipants(campaignId: string): Promise<CampaignParticipant[]> {
  if (!hasDatabase()) return [];
  
  const pool = getPool();
  
  const result = await pool.query(
    `SELECT * FROM public.campaign_participants 
     WHERE campaign_id = $1 AND status = 'active'`,
    [campaignId]
  );

  return result.rows.map(rowToParticipant);
}

// Row mappers
function rowToCampaign(row: any): Campaign {
  return {
    id: row.id,
    projectPubkey: row.project_pubkey,
    tokenMint: row.token_mint,
    name: row.name,
    description: row.description,
    totalFeeLamports: BigInt(row.total_fee_lamports),
    platformFeeLamports: BigInt(row.platform_fee_lamports),
    rewardPoolLamports: BigInt(row.reward_pool_lamports),
    startAtUnix: Number(row.start_at_unix),
    endAtUnix: Number(row.end_at_unix),
    epochDurationSeconds: Number(row.epoch_duration_seconds),
    minTokenBalance: BigInt(row.min_token_balance),
    weightLikeBps: Number(row.weight_like_bps),
    weightRetweetBps: Number(row.weight_retweet_bps),
    weightReplyBps: Number(row.weight_reply_bps),
    weightQuoteBps: Number(row.weight_quote_bps),
    trackingHandles: row.tracking_handles || [],
    trackingHashtags: row.tracking_hashtags || [],
    trackingUrls: row.tracking_urls || [],
    status: row.status,
    createdAtUnix: Number(row.created_at_unix),
    updatedAtUnix: Number(row.updated_at_unix),
  };
}

function rowToEpoch(row: any): Epoch {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    epochNumber: Number(row.epoch_number),
    startAtUnix: Number(row.start_at_unix),
    endAtUnix: Number(row.end_at_unix),
    rewardPoolLamports: BigInt(row.reward_pool_lamports),
    distributedLamports: BigInt(row.distributed_lamports),
    totalEngagementPoints: Number(row.total_engagement_points),
    participantCount: Number(row.participant_count),
    status: row.status,
    settledAtUnix: row.settled_at_unix ? Number(row.settled_at_unix) : undefined,
    createdAtUnix: Number(row.created_at_unix),
  };
}

function rowToEngagementEvent(row: any): EngagementEvent {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    epochId: row.epoch_id,
    walletPubkey: row.wallet_pubkey,
    registrationId: row.registration_id,
    tweetId: row.tweet_id,
    tweetType: row.tweet_type,
    tweetText: row.tweet_text,
    tweetCreatedAtUnix: Number(row.tweet_created_at_unix),
    referencedHandle: row.referenced_handle,
    referencedHashtag: row.referenced_hashtag,
    referencedUrl: row.referenced_url,
    parentTweetId: row.parent_tweet_id,
    basePoints: Number(row.base_points),
    balanceWeight: Number(row.balance_weight),
    timeConsistencyBonus: Number(row.time_consistency_bonus),
    antiSpamDampener: Number(row.anti_spam_dampener),
    finalScore: Number(row.final_score),
    isDuplicate: row.is_duplicate,
    isSpam: row.is_spam,
    spamReason: row.spam_reason,
    indexedAtUnix: Number(row.indexed_at_unix),
    createdAtUnix: Number(row.created_at_unix),
  };
}

function rowToParticipant(row: any): CampaignParticipant {
  return {
    campaignId: row.campaign_id,
    walletPubkey: row.wallet_pubkey,
    registrationId: row.registration_id,
    tokenBalanceSnapshot: BigInt(row.token_balance_snapshot),
    optedInAtUnix: Number(row.opted_in_at_unix),
    optedOutAtUnix: row.opted_out_at_unix ? Number(row.opted_out_at_unix) : undefined,
    status: row.status,
  };
}

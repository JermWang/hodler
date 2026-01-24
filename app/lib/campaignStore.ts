/**
 * AmpliFi Campaign Store
 * 
 * Database operations for campaigns, epochs, and engagement tracking.
 */

import { getPool, hasDatabase } from "./db";
import crypto from "crypto";

function getEnvNumber(name: string, fallback: number): number {
  const raw = Number(process.env[name] ?? "");
  if (Number.isFinite(raw) && raw > 0) return raw;
  return fallback;
}

function getEnvBigInt(name: string, fallback: bigint): bigint {
  const raw = String(process.env[name] ?? "").trim();
  if (!raw) return fallback;
  try {
    const value = BigInt(raw);
    return value >= 0n ? value : fallback;
  } catch {
    return fallback;
  }
}

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
  status: "active" | "paused" | "ended" | "cancelled" | "pending";
  createdAtUnix: number;
  updatedAtUnix: number;
  // Manual lock-up fields
  rewardAssetType: "sol" | "spl";
  rewardMint?: string;
  rewardDecimals: number;
  isManualLockup: boolean;
  escrowWalletPubkey?: string;
  creatorVerifiedAtUnix?: number;
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
  // Manual lock-up params
  rewardAssetType?: "sol" | "spl";
  rewardMint?: string;
  rewardDecimals?: number;
  isManualLockup?: boolean;
  escrowWalletPubkey?: string;
  status?: Campaign["status"];
  createEpochs?: boolean;
}): Promise<Campaign> {
  if (!hasDatabase()) throw new Error("Database not available");
  
  const pool = getPool();
  const nowUnix = Math.floor(Date.now() / 1000);
  const id = crypto.randomUUID();

  const isManualLockup = Boolean(params.isManualLockup);

  // 50/50 fee split for non-manual campaigns. Manual lockups fund 100% to rewards.
  const platformFeeLamports = isManualLockup ? 0n : params.totalFeeLamports / 2n;
  const rewardPoolLamports = params.totalFeeLamports - platformFeeLamports;

  const rewardAssetType = params.rewardAssetType || "sol";
  const rewardDecimals = params.rewardDecimals ?? (rewardAssetType === "sol" ? 9 : 6);
  const defaultEpochDurationSeconds = getEnvNumber("AMPLIFI_DEFAULT_EPOCH_DURATION", 86400);
  const defaultMinTokenBalance = getEnvBigInt("AMPLIFI_MIN_TOKEN_BALANCE", 0n);

  const campaignStatus = params.status ?? "active";
  const shouldCreateEpochs = params.createEpochs ?? true;

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
    epochDurationSeconds: params.epochDurationSeconds ?? defaultEpochDurationSeconds,
    minTokenBalance: params.minTokenBalance ?? defaultMinTokenBalance,
    weightLikeBps: params.weightLikeBps || 1000,
    weightRetweetBps: params.weightRetweetBps || 3000,
    weightReplyBps: params.weightReplyBps || 5000,
    weightQuoteBps: params.weightQuoteBps || 6000,
    trackingHandles: params.trackingHandles || [],
    trackingHashtags: params.trackingHashtags || [],
    trackingUrls: params.trackingUrls || [],
    status: campaignStatus,
    createdAtUnix: nowUnix,
    updatedAtUnix: nowUnix,
    // Manual lock-up fields
    rewardAssetType,
    rewardMint: params.rewardMint,
    rewardDecimals,
    isManualLockup,
    escrowWalletPubkey: params.escrowWalletPubkey,
    creatorVerifiedAtUnix: params.isManualLockup ? nowUnix : undefined,
  };

  await pool.query(
    `INSERT INTO public.campaigns 
     (id, project_pubkey, token_mint, name, description, total_fee_lamports,
      platform_fee_lamports, reward_pool_lamports, start_at_unix, end_at_unix,
      epoch_duration_seconds, min_token_balance, weight_like_bps, weight_retweet_bps,
      weight_reply_bps, weight_quote_bps, tracking_handles, tracking_hashtags,
      tracking_urls, status, created_at_unix, updated_at_unix,
      reward_asset_type, reward_mint, reward_decimals, is_manual_lockup, escrow_wallet_pubkey, creator_verified_at_unix)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)`,
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
      campaign.rewardAssetType,
      campaign.rewardMint || null,
      campaign.rewardDecimals,
      campaign.isManualLockup,
      campaign.escrowWalletPubkey || null,
      campaign.creatorVerifiedAtUnix || null,
    ]
  );

  // Create initial epochs
  if (shouldCreateEpochs && campaignStatus === "active") {
    await createEpochsForCampaign(campaign);
  }

  return campaign;
}

/**
 * Create epochs for a campaign based on duration
 */
export async function createEpochsForCampaign(campaign: Campaign): Promise<void> {
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
 * Get pending campaigns
 */
export async function getPendingCampaigns(): Promise<Campaign[]> {
  if (!hasDatabase()) return [];

  const pool = getPool();
  const nowUnix = Math.floor(Date.now() / 1000);

  const result = await pool.query(
    `SELECT * FROM public.campaigns
     WHERE status = 'pending' AND end_at_unix > $1
     ORDER BY created_at_unix DESC`,
    [nowUnix]
  );

  return result.rows.map(rowToCampaign);
}

/**
 * Get ended campaigns
 */
export async function getEndedCampaigns(): Promise<Campaign[]> {
  if (!hasDatabase()) return [];

  const pool = getPool();
  const nowUnix = Math.floor(Date.now() / 1000);

  const result = await pool.query(
    `SELECT * FROM public.campaigns
     WHERE status IN ('ended', 'cancelled')
        OR (status IN ('active', 'paused', 'pending') AND end_at_unix <= $1)
     ORDER BY end_at_unix DESC`,
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
     WHERE campaign_id = $1 AND status = 'active' AND start_at_unix <= $2 AND end_at_unix > $2
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
    // Manual lock-up fields
    rewardAssetType: row.reward_asset_type || "sol",
    rewardMint: row.reward_mint || undefined,
    rewardDecimals: Number(row.reward_decimals ?? 9),
    isManualLockup: Boolean(row.is_manual_lockup),
    escrowWalletPubkey: row.escrow_wallet_pubkey || undefined,
    creatorVerifiedAtUnix: row.creator_verified_at_unix ? Number(row.creator_verified_at_unix) : undefined,
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

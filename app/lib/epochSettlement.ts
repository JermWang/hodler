/**
 * AmpliFi Epoch Settlement System
 * 
 * Handles end-of-epoch reward calculations and distribution.
 */

import { getPool, hasDatabase } from "./db";
import { getEpochsReadyForSettlement, getCampaignById, getCampaignParticipants } from "./campaignStore";
import { calculateEpochRewards } from "./engagementScoring";
import crypto from "crypto";

export interface EpochSettlementResult {
  epochId: string;
  campaignId: string;
  epochNumber: number;
  totalParticipants: number;
  totalEngagementPoints: number;
  totalDistributedLamports: bigint;
  rewards: Array<{
    walletPubkey: string;
    rewardLamports: bigint;
    shareBps: number;
    engagementCount: number;
    totalScore: number;
  }>;
}

/**
 * Settle a single epoch - calculate and record rewards
 */
export async function settleEpoch(epochId: string): Promise<EpochSettlementResult | null> {
  if (!hasDatabase()) throw new Error("Database not available");
  
  const pool = getPool();
  const nowUnix = Math.floor(Date.now() / 1000);

  // Get epoch details
  const epochResult = await pool.query(
    `SELECT * FROM public.epochs WHERE id = $1`,
    [epochId]
  );

  if (epochResult.rows.length === 0) {
    throw new Error(`Epoch not found: ${epochId}`);
  }

  const epoch = epochResult.rows[0];

  // Check epoch is ready for settlement
  if (epoch.status !== "active") {
    console.log(`Epoch ${epochId} is not active (status: ${epoch.status})`);
    return null;
  }

  if (Number(epoch.end_at_unix) > nowUnix) {
    console.log(`Epoch ${epochId} has not ended yet`);
    return null;
  }

  // Mark epoch as settling
  await pool.query(
    `UPDATE public.epochs SET status = 'settling' WHERE id = $1`,
    [epochId]
  );

  try {
    // Get all engagement scores for this epoch
    const scoresResult = await pool.query(
      `SELECT 
         wallet_pubkey,
         COUNT(*) as engagement_count,
         SUM(final_score) as total_score
       FROM public.engagement_events 
       WHERE epoch_id = $1 AND is_duplicate = false
       GROUP BY wallet_pubkey
       ORDER BY total_score DESC`,
      [epochId]
    );

    const scores = scoresResult.rows.map((row) => ({
      walletPubkey: row.wallet_pubkey,
      totalScore: Number(row.total_score || 0),
      engagementCount: Number(row.engagement_count || 0),
    }));

    // Calculate reward distribution
    const rewardPoolLamports = BigInt(epoch.reward_pool_lamports);
    const rewardAllocations = calculateEpochRewards(
      scores.map((s) => ({ walletPubkey: s.walletPubkey, totalScore: s.totalScore })),
      rewardPoolLamports
    );

    // Merge allocations with engagement counts
    const rewards = rewardAllocations.map((alloc) => {
      const scoreData = scores.find((s) => s.walletPubkey === alloc.walletPubkey);
      return {
        ...alloc,
        engagementCount: scoreData?.engagementCount || 0,
        totalScore: scoreData?.totalScore || 0,
      };
    });

    // Record epoch scores
    for (const reward of rewards) {
      await pool.query(
        `INSERT INTO public.epoch_scores 
         (epoch_id, wallet_pubkey, total_engagement_points, engagement_count,
          token_balance_snapshot, balance_weight, final_score, reward_share_bps,
          reward_lamports, calculated_at_unix)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (epoch_id, wallet_pubkey) DO UPDATE SET
           total_engagement_points = EXCLUDED.total_engagement_points,
           engagement_count = EXCLUDED.engagement_count,
           final_score = EXCLUDED.final_score,
           reward_share_bps = EXCLUDED.reward_share_bps,
           reward_lamports = EXCLUDED.reward_lamports,
           calculated_at_unix = EXCLUDED.calculated_at_unix`,
        [
          epochId,
          reward.walletPubkey,
          reward.totalScore,
          reward.engagementCount,
          "0", // Token balance snapshot - would be fetched on-chain
          1.0, // Balance weight
          reward.totalScore,
          reward.shareBps,
          reward.rewardLamports.toString(),
          nowUnix,
        ]
      );
    }

    // Calculate totals
    const totalDistributedLamports = rewards.reduce(
      (sum, r) => sum + r.rewardLamports,
      0n
    );
    const totalEngagementPoints = scores.reduce(
      (sum, s) => sum + s.totalScore,
      0
    );

    // Mark epoch as settled
    await pool.query(
      `UPDATE public.epochs SET 
         status = 'settled',
         settled_at_unix = $2,
         distributed_lamports = $3,
         total_engagement_points = $4,
         participant_count = $5
       WHERE id = $1`,
      [
        epochId,
        nowUnix,
        totalDistributedLamports.toString(),
        totalEngagementPoints,
        rewards.length,
      ]
    );

    return {
      epochId,
      campaignId: epoch.campaign_id,
      epochNumber: Number(epoch.epoch_number),
      totalParticipants: rewards.length,
      totalEngagementPoints,
      totalDistributedLamports,
      rewards,
    };
  } catch (error) {
    // Revert epoch status on error
    await pool.query(
      `UPDATE public.epochs SET status = 'active' WHERE id = $1`,
      [epochId]
    );
    throw error;
  }
}

/**
 * Settle all epochs that are ready
 */
export async function settleAllReadyEpochs(): Promise<EpochSettlementResult[]> {
  const epochs = await getEpochsReadyForSettlement();
  const results: EpochSettlementResult[] = [];

  for (const epoch of epochs) {
    try {
      const result = await settleEpoch(epoch.id);
      if (result) {
        results.push(result);
      }
    } catch (error) {
      console.error(`Failed to settle epoch ${epoch.id}:`, error);
    }
  }

  return results;
}

/**
 * Get claimable rewards for a wallet
 */
export async function getClaimableRewards(walletPubkey: string): Promise<Array<{
  epochId: string;
  campaignId: string;
  campaignName: string;
  epochNumber: number;
  rewardLamports: bigint;
  shareBps: number;
  engagementCount: number;
  settledAtUnix: number;
  claimed: boolean;
}>> {
  if (!hasDatabase()) return [];
  
  const pool = getPool();
  
  const result = await pool.query(
    `SELECT 
       es.epoch_id,
       es.reward_lamports,
       es.reward_share_bps,
       es.engagement_count,
       e.campaign_id,
       e.epoch_number,
       e.settled_at_unix,
       c.name as campaign_name,
       rc.id as claim_id
     FROM public.epoch_scores es
     JOIN public.epochs e ON e.id = es.epoch_id
     JOIN public.campaigns c ON c.id = e.campaign_id
     LEFT JOIN public.reward_claims rc ON rc.epoch_id = es.epoch_id AND rc.wallet_pubkey = es.wallet_pubkey
     WHERE es.wallet_pubkey = $1 
       AND e.status = 'settled'
       AND es.reward_lamports > 0
     ORDER BY e.settled_at_unix DESC`,
    [walletPubkey]
  );

  return result.rows.map((row) => ({
    epochId: row.epoch_id,
    campaignId: row.campaign_id,
    campaignName: row.campaign_name,
    epochNumber: Number(row.epoch_number),
    rewardLamports: BigInt(row.reward_lamports),
    shareBps: Number(row.reward_share_bps),
    engagementCount: Number(row.engagement_count),
    settledAtUnix: Number(row.settled_at_unix),
    claimed: row.claim_id !== null,
  }));
}

/**
 * Record a reward claim
 */
export async function recordRewardClaim(params: {
  epochId: string;
  walletPubkey: string;
  amountLamports: bigint;
  txSig?: string;
}): Promise<void> {
  if (!hasDatabase()) throw new Error("Database not available");
  
  const pool = getPool();
  const nowUnix = Math.floor(Date.now() / 1000);
  const id = crypto.randomUUID();

  await pool.query(
    `INSERT INTO public.reward_claims 
     (id, epoch_id, wallet_pubkey, amount_lamports, tx_sig, claimed_at_unix, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (epoch_id, wallet_pubkey) DO NOTHING`,
    [
      id,
      params.epochId,
      params.walletPubkey,
      params.amountLamports.toString(),
      params.txSig || null,
      nowUnix,
      params.txSig ? "completed" : "pending",
    ]
  );
}

/**
 * Get holder stats across all campaigns
 */
export async function getHolderStats(walletPubkey: string): Promise<{
  totalEarned: bigint;
  totalClaimed: bigint;
  totalPending: bigint;
  campaignsJoined: number;
  totalEngagements: number;
  averageScore: number;
}> {
  if (!hasDatabase()) {
    return {
      totalEarned: 0n,
      totalClaimed: 0n,
      totalPending: 0n,
      campaignsJoined: 0,
      totalEngagements: 0,
      averageScore: 0,
    };
  }
  
  const pool = getPool();

  // Get total earned and claimed
  const earningsResult = await pool.query(
    `SELECT 
       COALESCE(SUM(es.reward_lamports), 0) as total_earned,
       COALESCE(SUM(CASE WHEN rc.id IS NOT NULL THEN es.reward_lamports ELSE 0 END), 0) as total_claimed
     FROM public.epoch_scores es
     LEFT JOIN public.reward_claims rc ON rc.epoch_id = es.epoch_id AND rc.wallet_pubkey = es.wallet_pubkey
     WHERE es.wallet_pubkey = $1`,
    [walletPubkey]
  );

  const totalEarned = BigInt(earningsResult.rows[0]?.total_earned || "0");
  const totalClaimed = BigInt(earningsResult.rows[0]?.total_claimed || "0");
  const totalPending = totalEarned - totalClaimed;

  // Get campaigns joined
  const campaignsResult = await pool.query(
    `SELECT COUNT(DISTINCT campaign_id) as count 
     FROM public.campaign_participants 
     WHERE wallet_pubkey = $1 AND status = 'active'`,
    [walletPubkey]
  );
  const campaignsJoined = Number(campaignsResult.rows[0]?.count || 0);

  // Get engagement stats
  const engagementResult = await pool.query(
    `SELECT 
       COUNT(*) as total_engagements,
       AVG(final_score) as average_score
     FROM public.engagement_events 
     WHERE wallet_pubkey = $1 AND is_duplicate = false`,
    [walletPubkey]
  );
  const totalEngagements = Number(engagementResult.rows[0]?.total_engagements || 0);
  const averageScore = Number(engagementResult.rows[0]?.average_score || 0);

  return {
    totalEarned,
    totalClaimed,
    totalPending,
    campaignsJoined,
    totalEngagements,
    averageScore,
  };
}

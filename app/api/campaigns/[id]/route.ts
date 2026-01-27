import { NextRequest } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { createEpochsForCampaign, getCampaignById, getCampaignParticipants, getCurrentEpoch } from "@/app/lib/campaignStore";
import { hasDatabase, getPool } from "@/app/lib/db";
import { getBondingCurveCreator, getClaimableCreatorFeeLamports } from "@/app/lib/pumpfun";
import { getConnection } from "@/app/lib/solana";
import { withTraceJson } from "@/app/lib/trace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/campaigns/[id]
 * 
 * Get campaign details with current epoch and stats
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const json = (body: Record<string, unknown>, init?: ResponseInit) => withTraceJson(req, body, init);
  try {
    if (!hasDatabase()) {
      return json({ error: "Database not available" }, { status: 503 });
    }

    const campaign = await getCampaignById(params.id);
    
    if (!campaign) {
      return json({ error: "Campaign not found" }, { status: 404 });
    }

    const pool = getPool();

    if (campaign.status === "pending" && campaign.isManualLockup && campaign.rewardPoolLamports === 0n) {
      const nowUnix = Math.floor(Date.now() / 1000);
      const updated = await pool.query(
        `update public.campaigns
         set status='active', updated_at_unix=$2
         where id=$1 and status='pending'
         returning id`,
        [params.id, String(nowUnix)]
      );

      if (updated.rows?.[0]?.id) {
        const epochsExist = await pool.query(`select id from public.epochs where campaign_id=$1 limit 1`, [params.id]);
        if (!epochsExist.rows?.length) {
          await createEpochsForCampaign({ ...campaign, status: "active", updatedAtUnix: nowUnix });
        }
        (campaign as any).status = "active";
        (campaign as any).updatedAtUnix = nowUnix;
      }
    }

    const currentEpoch = await getCurrentEpoch(params.id);
    const participants = await getCampaignParticipants(params.id);

    const keepLamportsRaw = Number(process.env.CTS_CREATOR_FEE_SWEEP_KEEP_LAMPORTS ?? "");
    const keepLamports = Number.isFinite(keepLamportsRaw) && keepLamportsRaw >= 10_000 ? Math.floor(keepLamportsRaw) : 5_000_000;

    let computedHolderLamports = 0n;
    let computedCreatorLamports = 0n;
    let totalClaimedLamports = 0n;
    try {
      // First try by campaignId
      const feeRes = await pool.query(
        `select
           coalesce(sum(
             coalesce(
               nullif(fields->>'holderShareLamports','')::bigint,
               nullif(fields->>'transferredLamports','')::bigint,
               0
             )
           ),0) as holder_sum,
           coalesce(sum(
             coalesce(
               nullif(fields->>'creatorShareLamports','')::bigint,
               nullif(fields->>'creatorPayoutLamports','')::bigint,
               case
                 when nullif(fields->>'claimedLamports','') is null then 0
                 else greatest(
                   0,
                   nullif(fields->>'claimedLamports','')::bigint -
                   coalesce(nullif(fields->>'transferredLamports','')::bigint,0) -
                   $2::bigint
                 )
               end
             )
           ),0) as creator_sum,
           coalesce(sum(
             coalesce(nullif(fields->>'claimedLamports','')::bigint, 0)
           ),0) as total_claimed
         from public.audit_logs
         where event='pumpfun_fee_sweep_ok'
           and fields->>'campaignId' = $1`,
        [params.id, String(keepLamports)]
      );

      let row = feeRes.rows?.[0] ?? null;
      
      // If no results by campaignId, try by tokenMint
      if (!row || (Number(row.holder_sum) === 0 && Number(row.creator_sum) === 0)) {
        const tokenMint = campaign.tokenMint;
        if (tokenMint) {
          const feeRes2 = await pool.query(
            `select
               coalesce(sum(
                 coalesce(
                   nullif(fields->>'holderShareLamports','')::bigint,
                   nullif(fields->>'transferredLamports','')::bigint,
                   0
                 )
               ),0) as holder_sum,
               coalesce(sum(
                 coalesce(
                   nullif(fields->>'creatorShareLamports','')::bigint,
                   nullif(fields->>'creatorPayoutLamports','')::bigint,
                   case
                     when nullif(fields->>'claimedLamports','') is null then 0
                     else greatest(
                       0,
                       nullif(fields->>'claimedLamports','')::bigint -
                       coalesce(nullif(fields->>'transferredLamports','')::bigint,0) -
                       $2::bigint
                     )
                   end
                 )
               ),0) as creator_sum,
               coalesce(sum(
                 coalesce(nullif(fields->>'claimedLamports','')::bigint, 0)
               ),0) as total_claimed
             from public.audit_logs
             where event in ('pumpfun_fee_sweep_ok', 'pumpfun_fee_claim_ok')
               and fields->>'tokenMint' = $1`,
            [tokenMint, String(keepLamports)]
          );
          row = feeRes2.rows?.[0] ?? row;
        }
      }
      
      if (row) {
        computedHolderLamports = BigInt(String(row.holder_sum ?? 0));
        computedCreatorLamports = BigInt(String(row.creator_sum ?? 0));
        totalClaimedLamports = BigInt(String(row.total_claimed ?? 0));
      }
    } catch {
    }
    
    // Total claimed from Pump.fun is the true "all-time" fee amount
    // Use the larger of: total claimed OR computed splits
    const computedTotalFeeLamports = computedHolderLamports + computedCreatorLamports;
    let allTimeTotalLamports = totalClaimedLamports > computedTotalFeeLamports ? totalClaimedLamports : computedTotalFeeLamports;
    
    // Also check current vault balance (fees not yet swept)
    let currentVaultLamports = 0n;
    try {
      const tokenMint = String(campaign.tokenMint ?? "").trim();
      if (tokenMint) {
        const connection = getConnection();
        const mintPk = new PublicKey(tokenMint);
        const creatorPk = await getBondingCurveCreator({ connection, mint: mintPk });
        const claimable = await getClaimableCreatorFeeLamports({ connection, creator: creatorPk });
        currentVaultLamports = BigInt(claimable.claimableLamports ?? 0);
      }
    } catch {
      // Ignore RPC errors
    }
    
    // True total = already swept + currently in vault
    allTimeTotalLamports = allTimeTotalLamports + currentVaultLamports;
    
    // Use allTimeTotalLamports as the base for fee display.
    // IMPORTANT: FeeSplitBar recomputes total as (creatorShare + holderShare) when both are provided.
    // So we must return shares that sum exactly to totalFeeLamports.
    const effectiveTotalFeeLamports = allTimeTotalLamports > campaign.totalFeeLamports ? allTimeTotalLamports : campaign.totalFeeLamports;

    let effectivePlatformFeeLamports = 0n;
    let effectiveRewardPoolLamports = 0n;
    if (campaign.isManualLockup) {
      // Manual lockups: 100% to rewards
      effectivePlatformFeeLamports = 0n;
      effectiveRewardPoolLamports = effectiveTotalFeeLamports;
    } else {
      // Standard campaigns: 50/50 split
      effectivePlatformFeeLamports = effectiveTotalFeeLamports / 2n;
      effectiveRewardPoolLamports = effectiveTotalFeeLamports - effectivePlatformFeeLamports;
    }

    // Get engagement stats
    const statsResult = await pool.query(
      `SELECT 
         COUNT(DISTINCT wallet_pubkey) as unique_participants,
         COUNT(*) as total_engagements,
         SUM(final_score) as total_score
       FROM public.engagement_events 
       WHERE campaign_id = $1`,
      [params.id]
    );
    
    const stats = statsResult.rows[0] || {
      unique_participants: 0,
      total_engagements: 0,
      total_score: 0,
    };

    return json({
      campaign: {
        ...campaign,
        totalFeeLamports: effectiveTotalFeeLamports.toString(),
        platformFeeLamports: effectivePlatformFeeLamports.toString(),
        rewardPoolLamports: effectiveRewardPoolLamports.toString(),
        minTokenBalance: campaign.minTokenBalance.toString(),
      },
      currentEpoch: currentEpoch ? {
        ...currentEpoch,
        rewardPoolLamports: currentEpoch.rewardPoolLamports.toString(),
        distributedLamports: currentEpoch.distributedLamports.toString(),
      } : null,
      stats: {
        participantCount: participants.length,
        uniqueEngagers: Number(stats.unique_participants),
        totalEngagements: Number(stats.total_engagements),
        totalScore: Number(stats.total_score || 0),
      },
    });
  } catch (error) {
    console.error("Failed to fetch campaign:", error);
    return json({ error: "Failed to fetch campaign" }, { status: 500 });
  }
}

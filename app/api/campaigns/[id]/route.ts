import { NextRequest } from "next/server";
import { getCampaignById, getCurrentEpoch, getCampaignParticipants } from "@/app/lib/campaignStore";
import { hasDatabase, getPool } from "@/app/lib/db";
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

    const currentEpoch = await getCurrentEpoch(params.id);
    const participants = await getCampaignParticipants(params.id);

    const pool = getPool();

    const keepLamportsRaw = Number(process.env.CTS_CREATOR_FEE_SWEEP_KEEP_LAMPORTS ?? "");
    const keepLamports = Number.isFinite(keepLamportsRaw) && keepLamportsRaw >= 10_000 ? Math.floor(keepLamportsRaw) : 5_000_000;

    let computedHolderLamports = 0n;
    let computedCreatorLamports = 0n;
    try {
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
           ),0) as creator_sum
         from public.audit_logs
         where event='pumpfun_fee_sweep_ok'
           and fields->>'campaignId' = $1`,
        [params.id, String(keepLamports)]
      );

      const row = feeRes.rows?.[0] ?? null;
      if (row) {
        computedHolderLamports = BigInt(String(row.holder_sum ?? 0));
        computedCreatorLamports = BigInt(String(row.creator_sum ?? 0));
      }
    } catch {
    }

    const computedTotalFeeLamports = computedHolderLamports + computedCreatorLamports;
    const effectiveTotalFeeLamports = campaign.totalFeeLamports > computedTotalFeeLamports ? campaign.totalFeeLamports : computedTotalFeeLamports;
    const effectivePlatformFeeLamports = campaign.platformFeeLamports > computedCreatorLamports ? campaign.platformFeeLamports : computedCreatorLamports;

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
        rewardPoolLamports: campaign.rewardPoolLamports.toString(),
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

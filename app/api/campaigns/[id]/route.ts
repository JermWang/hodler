import { NextRequest, NextResponse } from "next/server";
import { getCampaignById, getCurrentEpoch, getCampaignParticipants } from "@/app/lib/campaignStore";
import { hasDatabase, getPool } from "@/app/lib/db";

/**
 * GET /api/campaigns/[id]
 * 
 * Get campaign details with current epoch and stats
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (!hasDatabase()) {
      return NextResponse.json(
        { error: "Database not available" },
        { status: 503 }
      );
    }

    const campaign = await getCampaignById(params.id);
    
    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    const currentEpoch = await getCurrentEpoch(params.id);
    const participants = await getCampaignParticipants(params.id);

    // Get engagement stats
    const pool = getPool();
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

    return NextResponse.json({
      campaign: {
        ...campaign,
        totalFeeLamports: campaign.totalFeeLamports.toString(),
        platformFeeLamports: campaign.platformFeeLamports.toString(),
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
    return NextResponse.json(
      { error: "Failed to fetch campaign" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getPool, hasDatabase } from "@/app/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface LeaderboardEntry {
  rank: number;
  walletPubkey: string;
  twitterUsername: string | null;
  twitterProfileImageUrl: string | null;
  totalEarnedLamports: string;
  totalEngagements: number;
  campaignsJoined: number;
}

/**
 * GET /api/leaderboard
 * 
 * Returns top earners across all campaigns
 * Query params:
 * - limit: number (default 50, max 100)
 * - period: "all" | "week" | "month" (default "all")
 */
export async function GET(req: NextRequest) {
  try {
    if (!hasDatabase()) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    const { searchParams } = new URL(req.url);
    const limitParam = parseInt(searchParams.get("limit") || "50", 10);
    const limit = Math.min(Math.max(1, limitParam), 100);
    const period = searchParams.get("period") || "all";

    const pool = getPool();

    let timeFilter = "";
    if (period === "week") {
      const weekAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
      timeFilter = `AND er.created_at_unix >= ${weekAgo}`;
    } else if (period === "month") {
      const monthAgo = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;
      timeFilter = `AND er.created_at_unix >= ${monthAgo}`;
    }

    const query = `
      WITH earner_stats AS (
        SELECT 
          er.wallet_pubkey,
          SUM(er.reward_lamports) as total_earned_lamports,
          COUNT(DISTINCT er.epoch_id) as epochs_participated,
          COUNT(DISTINCT e.campaign_id) as campaigns_joined
        FROM public.epoch_rewards er
        JOIN public.epochs e ON e.id = er.epoch_id
        WHERE er.reward_lamports > 0 ${timeFilter}
        GROUP BY er.wallet_pubkey
        ORDER BY total_earned_lamports DESC
        LIMIT $1
      ),
      engagement_counts AS (
        SELECT 
          wallet_pubkey,
          COUNT(*) as total_engagements
        FROM public.engagement_events
        WHERE is_duplicate = false
        GROUP BY wallet_pubkey
      )
      SELECT 
        es.wallet_pubkey,
        es.total_earned_lamports,
        es.campaigns_joined,
        COALESCE(ec.total_engagements, 0) as total_engagements,
        hr.twitter_username,
        hr.twitter_profile_image_url
      FROM earner_stats es
      LEFT JOIN engagement_counts ec ON ec.wallet_pubkey = es.wallet_pubkey
      LEFT JOIN public.holder_registrations hr ON hr.wallet_pubkey = es.wallet_pubkey
      ORDER BY es.total_earned_lamports DESC
    `;

    const result = await pool.query(query, [limit]);

    const leaderboard: LeaderboardEntry[] = result.rows.map((row, index) => ({
      rank: index + 1,
      walletPubkey: row.wallet_pubkey,
      twitterUsername: row.twitter_username || null,
      twitterProfileImageUrl: row.twitter_profile_image_url || null,
      totalEarnedLamports: String(row.total_earned_lamports || "0"),
      totalEngagements: Number(row.total_engagements || 0),
      campaignsJoined: Number(row.campaigns_joined || 0),
    }));

    // Get total stats
    const totalStatsQuery = `
      SELECT 
        COUNT(DISTINCT wallet_pubkey) as total_earners,
        SUM(reward_lamports) as total_distributed
      FROM public.epoch_rewards
      WHERE reward_lamports > 0
    `;
    const totalStats = await pool.query(totalStatsQuery);
    const stats = {
      totalEarners: Number(totalStats.rows[0]?.total_earners || 0),
      totalDistributedLamports: String(totalStats.rows[0]?.total_distributed || "0"),
    };

    return NextResponse.json({
      ok: true,
      leaderboard,
      stats,
      period,
    });
  } catch (error) {
    console.error("Failed to fetch leaderboard:", error);
    return NextResponse.json({ error: "Failed to fetch leaderboard" }, { status: 500 });
  }
}

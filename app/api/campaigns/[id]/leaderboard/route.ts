import { NextRequest, NextResponse } from "next/server";
import { getPool, hasDatabase } from "@/app/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LeaderRow = {
  rank: number;
  walletPubkey: string;
  twitterUsername: string | null;
  twitterProfileImageUrl: string | null;
  totalScore?: number;
  engagements?: number;
  totalEarnedLamports?: string;
};

function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * GET /api/campaigns/[id]/leaderboard
 *
 * Returns two leaderboards:
 * - activeShillers: based on engagement_events in the current epoch
 * - payoutLeaders: based on epoch_scores / epoch_rewards totals for this campaign
 */
export async function GET(req: NextRequest, ctx: { params: { id: string } }) {
  try {
    if (!hasDatabase()) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    const campaignId = String(ctx?.params?.id ?? "").trim();
    if (!campaignId) {
      return NextResponse.json({ error: "Missing campaign id" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const limitParam = parseInt(searchParams.get("limit") || "50", 10);
    const limit = Math.min(Math.max(1, limitParam), 100);

    const pool = getPool();

    const campaignRes = await pool.query(
      `select id, name
       from public.campaigns
       where id=$1
       limit 1`,
      [campaignId]
    );
    const campaignRow = campaignRes.rows?.[0] ?? null;
    if (!campaignRow) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const t = nowUnix();
    const epochRes = await pool.query(
      `select id, epoch_number, start_at_unix, end_at_unix
       from public.epochs
       where campaign_id=$1 and start_at_unix <= $2 and end_at_unix > $2
       order by epoch_number desc
       limit 1`,
      [campaignId, t]
    );
    const currentEpoch = epochRes.rows?.[0] ?? null;

    const hasEpochRewardsRes = await pool.query("select to_regclass('public.epoch_rewards') as t");
    const hasEpochRewards = Boolean(hasEpochRewardsRes.rows?.[0]?.t);

    const activeShillers: LeaderRow[] = [];
    if (currentEpoch?.id) {
      const shillersRes = await pool.query(
        `with shillers as (
          select
            ee.wallet_pubkey,
            count(*) as engagements,
            sum(ee.final_score) as total_score
          from public.engagement_events ee
          where ee.campaign_id=$1
            and ee.epoch_id=$2
            and ee.is_duplicate=false
            and ee.is_spam=false
          group by ee.wallet_pubkey
          order by total_score desc
          limit $3
        )
        select
          s.wallet_pubkey,
          s.engagements,
          s.total_score,
          hr.twitter_username,
          hr.twitter_profile_image_url
        from shillers s
        left join public.holder_registrations hr on hr.wallet_pubkey = s.wallet_pubkey
        order by s.total_score desc`,
        [campaignId, String(currentEpoch.id), limit]
      );

      activeShillers.push(
        ...(shillersRes.rows ?? []).map((row: any, idx: number) => ({
          rank: idx + 1,
          walletPubkey: String(row.wallet_pubkey),
          twitterUsername: row.twitter_username ? String(row.twitter_username) : null,
          twitterProfileImageUrl: row.twitter_profile_image_url ? String(row.twitter_profile_image_url) : null,
          totalScore: Number(row.total_score ?? 0),
          engagements: Number(row.engagements ?? 0),
        }))
      );
    }

    const payoutLeadersRes = await pool.query(
      hasEpochRewards
        ? `with earners as (
            select
              er.wallet_pubkey,
              sum(er.reward_lamports) as total_earned_lamports
            from public.epoch_rewards er
            join public.epochs e on e.id = er.epoch_id
            where e.campaign_id=$1
              and e.status='settled'
              and er.reward_lamports > 0
            group by er.wallet_pubkey
            order by total_earned_lamports desc
            limit $2
          )
          select
            ea.wallet_pubkey,
            ea.total_earned_lamports,
            hr.twitter_username,
            hr.twitter_profile_image_url
          from earners ea
          left join public.holder_registrations hr on hr.wallet_pubkey = ea.wallet_pubkey
          order by ea.total_earned_lamports desc`
        : `with earners as (
            select
              es.wallet_pubkey,
              sum(es.reward_lamports) as total_earned_lamports
            from public.epoch_scores es
            join public.epochs e on e.id = es.epoch_id
            where e.campaign_id=$1
              and e.status='settled'
              and es.reward_lamports > 0
            group by es.wallet_pubkey
            order by total_earned_lamports desc
            limit $2
          )
          select
            ea.wallet_pubkey,
            ea.total_earned_lamports,
            hr.twitter_username,
            hr.twitter_profile_image_url
          from earners ea
          left join public.holder_registrations hr on hr.wallet_pubkey = ea.wallet_pubkey
          order by ea.total_earned_lamports desc`,
      [campaignId, limit]
    );

    const payoutLeaders: LeaderRow[] = (payoutLeadersRes.rows ?? []).map((row: any, idx: number) => ({
      rank: idx + 1,
      walletPubkey: String(row.wallet_pubkey),
      twitterUsername: row.twitter_username ? String(row.twitter_username) : null,
      twitterProfileImageUrl: row.twitter_profile_image_url ? String(row.twitter_profile_image_url) : null,
      totalEarnedLamports: String(row.total_earned_lamports ?? "0"),
    }));

    return NextResponse.json({
      ok: true,
      campaign: {
        id: String(campaignRow.id),
        name: String(campaignRow.name ?? ""),
      },
      currentEpoch: currentEpoch
        ? {
            id: String(currentEpoch.id),
            epochNumber: Number(currentEpoch.epoch_number ?? 0),
            startAtUnix: Number(currentEpoch.start_at_unix ?? 0),
            endAtUnix: Number(currentEpoch.end_at_unix ?? 0),
          }
        : null,
      activeShillers,
      payoutLeaders,
    });
  } catch (e) {
    console.error("Failed to fetch campaign leaderboard:", e);
    return NextResponse.json({ error: "Failed to fetch campaign leaderboard" }, { status: 500 });
  }
}

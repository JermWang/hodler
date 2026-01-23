import { NextRequest, NextResponse } from "next/server";

import { getPool, hasDatabase } from "@/app/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

function periodToWindowSeconds(period: string): number | null {
  const p = String(period ?? "").trim().toLowerCase();
  if (p === "24h" || p === "day") return 24 * 60 * 60;
  if (p === "7d" || p === "week") return 7 * 24 * 60 * 60;
  return null;
}

function safeNum(v: any): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function GET(req: NextRequest) {
  try {
    if (!hasDatabase()) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    const { searchParams } = new URL(req.url);
    const period = String(searchParams.get("period") ?? "all").trim();
    const limitParam = parseInt(searchParams.get("limit") || "50", 10);
    const limit = Math.min(Math.max(1, limitParam), 100);

    const windowSeconds = periodToWindowSeconds(period);
    const t = nowUnix();
    const fromUnix = windowSeconds ? t - windowSeconds : null;

    const trendWindowSeconds = 7 * 24 * 60 * 60;
    const trendCurFrom = t - trendWindowSeconds;
    const trendPrevFrom = t - 2 * trendWindowSeconds;
    const trendPrevTo = trendCurFrom;

    const pool = getPool();

    const hasEpochRewardsRes = await pool.query("select to_regclass('public.epoch_rewards') as t");
    const hasEpochRewards = Boolean(hasEpochRewardsRes.rows?.[0]?.t);

    const q = `
      with base_campaigns as (
        select id, token_mint
        from public.campaigns
        where token_mint is not null and token_mint <> ''
      ),
      score_totals as (
        select
          c.token_mint,
          sum(ee.final_score) as exposure_score,
          count(distinct ee.wallet_pubkey) as unique_engagers
        from base_campaigns c
        join public.engagement_events ee on ee.campaign_id = c.id
        where ee.is_duplicate=false
          and ee.is_spam=false
          ${fromUnix ? `and ee.created_at_unix >= ${fromUnix}` : ""}
        group by c.token_mint
      ),
      trend_cur as (
        select
          c.token_mint,
          sum(ee.final_score) as exposure_score
        from base_campaigns c
        join public.engagement_events ee on ee.campaign_id = c.id
        where ee.is_duplicate=false
          and ee.is_spam=false
          and ee.created_at_unix >= ${trendCurFrom}
        group by c.token_mint
      ),
      trend_prev as (
        select
          c.token_mint,
          sum(ee.final_score) as exposure_score
        from base_campaigns c
        join public.engagement_events ee on ee.campaign_id = c.id
        where ee.is_duplicate=false
          and ee.is_spam=false
          and ee.created_at_unix >= ${trendPrevFrom}
          and ee.created_at_unix < ${trendPrevTo}
        group by c.token_mint
      ),
      payout_totals as (
        ${hasEpochRewards
          ? `
          select
            c.token_mint,
            sum(er.reward_lamports) as total_earned_lamports
          from base_campaigns c
          join public.epochs e on e.campaign_id = c.id
          join public.epoch_rewards er on er.epoch_id = e.id
          where e.status='settled'
            and er.reward_lamports > 0
            ${fromUnix ? `and e.settled_at_unix >= ${fromUnix}` : ""}
          group by c.token_mint
        `
          : `
          select
            c.token_mint,
            sum(es.reward_lamports) as total_earned_lamports
          from base_campaigns c
          join public.epochs e on e.campaign_id = c.id
          join public.epoch_scores es on es.epoch_id = e.id
          where e.status='settled'
            and es.reward_lamports > 0
            ${fromUnix ? `and e.settled_at_unix >= ${fromUnix}` : ""}
          group by c.token_mint
        `}
      ),
      latest_campaign as (
        select distinct on (token_mint)
          token_mint,
          id as campaign_id,
          created_at_unix
        from public.campaigns
        where token_mint is not null and token_mint <> ''
        order by token_mint, created_at_unix desc
      )
      select
        st.token_mint,
        st.exposure_score,
        st.unique_engagers,
        coalesce(pt.total_earned_lamports, 0) as total_earned_lamports,
        coalesce(tc.exposure_score, 0) as trend_cur_score,
        coalesce(tp.exposure_score, 0) as trend_prev_score,
        lc.campaign_id,
        pp.name,
        pp.symbol,
        pp.image_url
      from score_totals st
      left join payout_totals pt on pt.token_mint = st.token_mint
      left join trend_cur tc on tc.token_mint = st.token_mint
      left join trend_prev tp on tp.token_mint = st.token_mint
      left join latest_campaign lc on lc.token_mint = st.token_mint
      left join public.project_profiles pp on pp.token_mint = st.token_mint
      order by st.exposure_score desc
      limit $1
    `;

    const res = await pool.query(q, [limit]);

    const rows = (res.rows ?? []) as any[];
    const entries = rows.map((row, idx) => {
      const cur = safeNum(row.trend_cur_score);
      const prev = safeNum(row.trend_prev_score);
      const trendPct = prev > 0 ? ((cur - prev) / prev) * 100 : cur > 0 ? 100 : 0;

      return {
        rank: idx + 1,
        tokenMint: String(row.token_mint ?? ""),
        campaignId: row.campaign_id ? String(row.campaign_id) : null,
        name: row.name == null ? null : String(row.name),
        symbol: row.symbol == null ? null : String(row.symbol),
        imageUrl: row.image_url == null ? null : String(row.image_url),
        exposureScore: safeNum(row.exposure_score),
        uniqueEngagers: Math.max(0, Math.floor(safeNum(row.unique_engagers))),
        totalEarnedLamports: String(row.total_earned_lamports ?? "0"),
        trendPct,
      };
    });

    return NextResponse.json({ ok: true, period, entries });
  } catch (e) {
    console.error("Failed to fetch discover rankings:", e);
    return NextResponse.json({ error: "Failed to fetch rankings" }, { status: 500 });
  }
}

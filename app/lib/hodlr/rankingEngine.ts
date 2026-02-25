import { getPool, hasDatabase } from "../db";
import { isHodlrShadowMode } from "./flags";
import { ensureHodlrSchema, insertHodlrRankingsIfAbsent, updateHodlrEpochStatus } from "./store";

function envNumber(name: string, fallback: number): number {
  const raw = Number(process.env[name] ?? "");
  if (Number.isFinite(raw) && raw > 0) return raw;
  return fallback;
}

function getAlpha(): number {
  const raw = Number(process.env.HODLR_WEIGHT_ALPHA ?? "");
  if (Number.isFinite(raw) && raw >= 0) return raw;
  return 0.6;
}

function getBeta(): number {
  const raw = Number(process.env.HODLR_WEIGHT_BETA ?? "");
  if (Number.isFinite(raw) && raw >= 0) return raw;
  return 0.4;
}

function lnBigIntFromDecimalString(raw: string): number {
  const s0 = String(raw ?? "").trim();
  const s = s0.replace(/^0+/, "");
  if (!s) return Number.NEGATIVE_INFINITY;
  if (!/^[0-9]+$/.test(s)) return Number.NEGATIVE_INFINITY;

  const k = 15;
  const len = s.length;
  const head = s.slice(0, Math.min(k, len));
  const mantissa = Number(head);
  if (!Number.isFinite(mantissa) || mantissa <= 0) return Number.NEGATIVE_INFINITY;

  const scalePow10 = Math.max(0, len - head.length);
  return Math.log(mantissa) + scalePow10 * Math.log(10);
}

function stableLogSumExp(logs: number[]): number {
  if (!logs.length) return Number.NEGATIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const x of logs) {
    if (x > max) max = x;
  }
  if (!Number.isFinite(max)) return Number.NEGATIVE_INFINITY;

  let sum = 0;
  for (const x of logs) {
    const v = Math.exp(x - max);
    if (Number.isFinite(v)) sum += v;
  }
  if (!Number.isFinite(sum) || sum <= 0) return Number.NEGATIVE_INFINITY;
  return max + Math.log(sum);
}

export async function runHodlrRankingShadow(input?: { epochId?: string }): Promise<{
  ok: true;
  skipped?: boolean;
  reason?: string;
  epochId?: string;
  epochNumber?: number;
  topN?: number;
  rankingsInserted?: number;
}> {
  if (!isHodlrShadowMode()) return { ok: true, skipped: true, reason: "HODLR shadow mode disabled" };
  if (!hasDatabase()) return { ok: true, skipped: true, reason: "Database not available" };

  await ensureHodlrSchema();

  const pool = getPool();

  const epochIdExplicit = String(input?.epochId ?? "").trim();

  const epochRes = epochIdExplicit
    ? await pool.query(
        `select id, epoch_number, status
         from public.hodlr_epochs
         where id=$1
         limit 1`,
        [epochIdExplicit]
      )
    : await pool.query(
        `select id, epoch_number, status
         from public.hodlr_epochs
         where status in ('finalized')
         order by end_at_unix desc
         limit 1`
      );

  const epochRow = epochRes.rows?.[0] ?? null;
  if (!epochRow) return { ok: true, skipped: true, reason: "No finalized epoch found" };

  const epochId = String(epochRow.id ?? "").trim();
  const epochNumber = Number(epochRow.epoch_number ?? 0);
  const status = String(epochRow.status ?? "").trim();
  if (!epochId) return { ok: true, skipped: true, reason: "Invalid epoch" };

  if (status !== "finalized") {
    return { ok: true, skipped: true, reason: `Epoch status not finalized (${status})`, epochId, epochNumber };
  }

  const lockClient = await pool.connect();
  let lockAcquired = false;
  try {
    const lockKey = `hodlr_rank_run:${epochId}`;
    const lockRes = await lockClient.query("select pg_try_advisory_lock(hashtext($1)) as ok", [lockKey]);
    lockAcquired = Boolean(lockRes.rows?.[0]?.ok);
    if (!lockAcquired) {
      return { ok: true, skipped: true, reason: "Ranking already running", epochId, epochNumber };
    }

    const existing = await pool.query(
      `select 1 from public.hodlr_rankings where epoch_id=$1 limit 1`,
      [epochId]
    );
    if ((existing.rows ?? []).length) {
      return { ok: true, skipped: true, reason: "Rankings already computed", epochId, epochNumber };
    }

    const topN = Math.max(1, Math.min(200, Math.floor(envNumber("HODLR_TOP_N", 50))));

    const topRes = await pool.query(
      `select
         wallet_pubkey,
         balance_raw,
         first_seen_unix,
         snapshot_at_unix,
         greatest(0, snapshot_at_unix - first_seen_unix) as holding_seconds
       from public.hodlr_snapshots
       where epoch_id=$1
       order by
         greatest(0, snapshot_at_unix - first_seen_unix) desc,
         balance_raw::numeric desc,
         wallet_pubkey asc
       limit ${topN}`,
      [epochId]
    );

    const rows = (topRes.rows ?? []) as Array<{
      wallet_pubkey: string;
      balance_raw: string;
      holding_seconds: any;
    }>;

    if (!rows.length) {
      return { ok: true, skipped: true, reason: "No snapshots for epoch", epochId, epochNumber, topN };
    }

    const alpha = getAlpha();
    const beta = getBeta();

    const holdingDays: number[] = [];
    const logWeights: number[] = [];

    for (const r of rows) {
      const hs = Number(r.holding_seconds ?? 0);
      const days = Number.isFinite(hs) && hs > 0 ? hs / 86400 : 0;
      holdingDays.push(days);

      const lnDays = days > 0 ? Math.log(days) : Number.NEGATIVE_INFINITY;
      const lnBal = lnBigIntFromDecimalString(String(r.balance_raw ?? "0"));
      const lw = alpha * lnDays + beta * lnBal;
      logWeights.push(lw);
    }

    let logSum = stableLogSumExp(logWeights);
    const allBad = !Number.isFinite(logSum);

    const bpsExact: Array<{ walletPubkey: string; exact: number; floor: number; frac: number }> = [];

    if (allBad) {
      const uniform = 10000 / rows.length;
      for (let i = 0; i < rows.length; i++) {
        const wallet = String(rows[i].wallet_pubkey);
        const exact = uniform;
        const flo = Math.floor(exact);
        bpsExact.push({ walletPubkey: wallet, exact, floor: flo, frac: exact - flo });
      }
    } else {
      for (let i = 0; i < rows.length; i++) {
        const wallet = String(rows[i].wallet_pubkey);
        const p = Math.exp(logWeights[i] - logSum);
        const exact = Number.isFinite(p) && p > 0 ? p * 10000 : 0;
        const flo = Math.floor(exact);
        bpsExact.push({ walletPubkey: wallet, exact, floor: flo, frac: exact - flo });
      }
    }

    let sumFloor = bpsExact.reduce((acc, r) => acc + r.floor, 0);
    let remaining = 10000 - sumFloor;
    if (remaining < 0) remaining = 0;

    const bumpOrder = bpsExact
      .slice()
      .sort((a, b) => {
        if (b.frac !== a.frac) return b.frac - a.frac;
        return a.walletPubkey < b.walletPubkey ? -1 : a.walletPubkey > b.walletPubkey ? 1 : 0;
      });

    const bump = new Map<string, number>();
    for (let i = 0; i < remaining; i++) {
      const r = bumpOrder[i % bumpOrder.length];
      bump.set(r.walletPubkey, (bump.get(r.walletPubkey) ?? 0) + 1);
    }

    const maxLog = logWeights.reduce((m, x) => (x > m ? x : m), Number.NEGATIVE_INFINITY);

    const rankingRows = rows.map((r, idx) => {
      const walletPubkey = String(r.wallet_pubkey);
      const balanceRaw = String(r.balance_raw ?? "0");
      const days = holdingDays[idx];
      const weight = Number.isFinite(maxLog) ? Math.exp(logWeights[idx] - maxLog) : 0;
      const shareBps = Math.max(0, (bpsExact[idx]?.floor ?? 0) + (bump.get(walletPubkey) ?? 0));
      return {
        epochId,
        walletPubkey,
        rank: idx + 1,
        holdingDays: days,
        balanceRaw,
        weight,
        shareBps,
      };
    });

    const inserted = await insertHodlrRankingsIfAbsent({ epochId, rows: rankingRows });
    if (inserted.skipped) {
      return { ok: true, skipped: true, reason: "Rankings already inserted", epochId, epochNumber, topN };
    }

    await updateHodlrEpochStatus({ epochId, status: "ranking_computed" });

    return {
      ok: true,
      epochId,
      epochNumber,
      topN: rows.length,
      rankingsInserted: inserted.inserted,
    };
  } finally {
    if (lockAcquired) {
      try {
        const lockKey = `hodlr_rank_run:${epochId}`;
        await lockClient.query("select pg_advisory_unlock(hashtext($1))", [lockKey]);
      } catch {
      }
    }
    lockClient.release();
  }
}

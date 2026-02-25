import { getPool, hasDatabase } from "../db";
import { isHodlrShadowMode } from "./flags";
import { ensureHodlrSchema, insertHodlrDistributionsIfAbsent, updateHodlrEpochStatus } from "./store";

function readPoolLamportsEnv(): bigint {
  const raw = String(process.env.HODLR_DISTRIBUTION_POOL_LAMPORTS ?? process.env.HODLR_POOL_LAMPORTS ?? "").trim();
  if (!raw) return 0n;
  try {
    const v = BigInt(raw);
    return v > 0n ? v : 0n;
  } catch {
    return 0n;
  }
}

function normalizeShareBps(rows: Array<{ walletPubkey: string; shareBps: number }>): Array<{ walletPubkey: string; shareBps: number }> {
  const cleaned = rows
    .map((r) => ({
      walletPubkey: String(r.walletPubkey ?? "").trim(),
      shareBps: Math.max(0, Math.floor(Number(r.shareBps ?? 0) || 0)),
    }))
    .filter((r) => r.walletPubkey.length);

  if (!cleaned.length) return [];

  const sum = cleaned.reduce((acc, r) => acc + r.shareBps, 0);
  if (!Number.isFinite(sum) || sum <= 0) {
    const base = Math.floor(10000 / cleaned.length);
    let rem = 10000 - base * cleaned.length;
    const out = cleaned
      .slice()
      .sort((a, b) => (a.walletPubkey < b.walletPubkey ? -1 : a.walletPubkey > b.walletPubkey ? 1 : 0))
      .map((r) => ({ walletPubkey: r.walletPubkey, shareBps: base }));

    for (let i = 0; i < out.length && rem > 0; i++) {
      out[i].shareBps += 1;
      rem -= 1;
    }

    return out;
  }

  if (sum === 10000) return cleaned;

  const exacts = cleaned.map((r) => {
    const exact = (r.shareBps / sum) * 10000;
    const flo = Math.floor(exact);
    return { walletPubkey: r.walletPubkey, exact, floor: flo, frac: exact - flo };
  });

  let floorSum = exacts.reduce((acc, r) => acc + r.floor, 0);
  let rem = 10000 - floorSum;
  if (rem < 0) rem = 0;

  exacts.sort((a, b) => {
    if (b.frac !== a.frac) return b.frac - a.frac;
    return a.walletPubkey < b.walletPubkey ? -1 : a.walletPubkey > b.walletPubkey ? 1 : 0;
  });

  const bump = new Map<string, number>();
  for (let i = 0; i < rem; i++) {
    const r = exacts[i % exacts.length];
    bump.set(r.walletPubkey, (bump.get(r.walletPubkey) ?? 0) + 1);
  }

  const out = exacts
    .slice()
    .sort((a, b) => (a.walletPubkey < b.walletPubkey ? -1 : a.walletPubkey > b.walletPubkey ? 1 : 0))
    .map((r) => ({ walletPubkey: r.walletPubkey, shareBps: r.floor + (bump.get(r.walletPubkey) ?? 0) }));

  return out;
}

export async function runHodlrDistributionDryRunShadow(input?: { epochId?: string }): Promise<{
  ok: true;
  skipped?: boolean;
  reason?: string;
  epochId?: string;
  epochNumber?: number;
  totalLamports?: string;
  recipients?: number;
  inserted?: number;
}> {
  if (!isHodlrShadowMode()) return { ok: true, skipped: true, reason: "HODLR shadow mode disabled" };
  if (!hasDatabase()) return { ok: true, skipped: true, reason: "Database not available" };

  const totalLamports = readPoolLamportsEnv();
  if (totalLamports <= 0n) {
    return { ok: true, skipped: true, reason: "Missing HODLR_DISTRIBUTION_POOL_LAMPORTS" };
  }

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
         where status in ('ranking_computed')
         order by end_at_unix desc
         limit 1`
      );

  const epochRow = epochRes.rows?.[0] ?? null;
  if (!epochRow) return { ok: true, skipped: true, reason: "No ranking_computed epoch found" };

  const epochId = String(epochRow.id ?? "").trim();
  const epochNumber = Number(epochRow.epoch_number ?? 0);
  const status = String(epochRow.status ?? "").trim();
  if (!epochId) return { ok: true, skipped: true, reason: "Invalid epoch" };

  if (status !== "ranking_computed") {
    return { ok: true, skipped: true, reason: `Epoch status not ranking_computed (${status})`, epochId, epochNumber };
  }

  const lockClient = await pool.connect();
  let lockAcquired = false;
  try {
    const lockKey = `hodlr_dist_run:${epochId}`;
    const lockRes = await lockClient.query("select pg_try_advisory_lock(hashtext($1)) as ok", [lockKey]);
    lockAcquired = Boolean(lockRes.rows?.[0]?.ok);
    if (!lockAcquired) {
      return { ok: true, skipped: true, reason: "Distribution already running", epochId, epochNumber };
    }

    const existing = await pool.query(
      `select 1 from public.hodlr_distributions where epoch_id=$1 limit 1`,
      [epochId]
    );
    if ((existing.rows ?? []).length) {
      return { ok: true, skipped: true, reason: "Distributions already computed", epochId, epochNumber };
    }

    const rankRes = await pool.query(
      `select wallet_pubkey, share_bps
       from public.hodlr_rankings
       where epoch_id=$1
       order by rank asc, wallet_pubkey asc`,
      [epochId]
    );

    const raw = (rankRes.rows ?? []) as Array<{ wallet_pubkey: string; share_bps: any }>;
    if (!raw.length) {
      return { ok: true, skipped: true, reason: "No rankings for epoch", epochId, epochNumber };
    }

    const normalized = normalizeShareBps(
      raw.map((r) => ({ walletPubkey: String(r.wallet_pubkey ?? ""), shareBps: Number(r.share_bps ?? 0) }))
    );

    const denom = 10000n;

    const computed = normalized
      .slice()
      .sort((a, b) => (a.walletPubkey < b.walletPubkey ? -1 : a.walletPubkey > b.walletPubkey ? 1 : 0))
      .map((r) => {
        const shareBps = Math.max(0, Math.min(10000, Math.floor(Number(r.shareBps) || 0)));
        const num = totalLamports * BigInt(shareBps);
        const amount = num / denom;
        const remainder = num % denom;
        return { walletPubkey: r.walletPubkey, shareBps, amountLamports: amount, remainder }; 
      });

    let sum = 0n;
    for (const r of computed) sum += r.amountLamports;
    let leftover = totalLamports - sum;
    if (leftover < 0n) leftover = 0n;

    if (leftover > 0n) {
      const bumpOrder = computed
        .slice()
        .sort((a, b) => {
          if (a.remainder === b.remainder) {
            return a.walletPubkey < b.walletPubkey ? -1 : a.walletPubkey > b.walletPubkey ? 1 : 0;
          }
          return a.remainder > b.remainder ? -1 : 1;
        });

      const max = Number(leftover > BigInt(bumpOrder.length) ? BigInt(bumpOrder.length) : leftover);
      for (let i = 0; i < max; i++) {
        bumpOrder[i].amountLamports += 1n;
      }
    }

    const finalRows = computed.map((r) => ({
      walletPubkey: r.walletPubkey,
      amountLamports: r.amountLamports.toString(),
    }));

    const inserted = await insertHodlrDistributionsIfAbsent({ epochId, rows: finalRows });
    if (inserted.skipped) {
      return { ok: true, skipped: true, reason: "Distributions already inserted", epochId, epochNumber };
    }

    await updateHodlrEpochStatus({ epochId, status: "distribution_dry_run" });

    return {
      ok: true,
      epochId,
      epochNumber,
      totalLamports: totalLamports.toString(),
      recipients: finalRows.length,
      inserted: inserted.inserted,
    };
  } finally {
    if (lockAcquired) {
      try {
        const lockKey = `hodlr_dist_run:${epochId}`;
        await lockClient.query("select pg_advisory_unlock(hashtext($1))", [lockKey]);
      } catch {
      }
    }
    lockClient.release();
  }
}

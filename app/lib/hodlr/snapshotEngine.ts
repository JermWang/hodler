import { PublicKey } from "@solana/web3.js";

import { getConnection, getChainUnixTime, getTokenProgramIdForMint } from "../solana";
import { withRetry } from "../rpc";
import { getPool, hasDatabase } from "../db";
import { isHodlrShadowMode } from "./flags";
import {
  bulkUpsertHodlrHolderState,
  createHodlrEpoch,
  ensureHodlrSchema,
  getHodlrEpochByNumber,
  insertHodlrSnapshotBalancesBulk,
  markHodlrHolderStateNotSeenAsZero,
  updateHodlrEpochStatus,
} from "./store";
import type { HodlrEpochRecord } from "./types";

function getWeekStartUnixFromUnix(nowUnix: number): number {
  const d = new Date(Math.floor(nowUnix) * 1000);
  const utcDay = d.getUTCDay();
  const daysSinceMonday = (utcDay + 6) % 7;
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const date = d.getUTCDate();
  const startMs = Date.UTC(year, month, date - daysSinceMonday, 0, 0, 0, 0);
  return Math.floor(startMs / 1000);
}

function readHodlrMintEnv(): string {
  const mint = String(process.env.HODLR_TOKEN_MINT ?? "").trim();
  return mint;
}

async function resolveHodlrMintRaw(): Promise<string> {
  const env = readHodlrMintEnv();
  return env;
}

function getMinBalanceRaw(): bigint {
  const raw = String(process.env.HODLR_MIN_BALANCE_RAW ?? "").trim();
  if (!raw) return 0n;
  try {
    const v = BigInt(raw);
    return v >= 0n ? v : 0n;
  } catch {
    return 0n;
  }
}

function getExcludedWallets(): Set<string> {
  const raw = String(process.env.HODLR_EXCLUDED_WALLETS ?? "").trim();
  const out = new Set<string>();
  for (const part of raw.split(",")) {
    const v = part.trim();
    if (v) out.add(v);
  }
  return out;
}

function shouldExcludeOffCurveWallets(): boolean {
  const raw = String(process.env.HODLR_EXCLUDE_OFF_CURVE_WALLETS ?? "true").trim().toLowerCase();
  return raw !== "0" && raw !== "false" && raw !== "no" && raw !== "off";
}

function isOnCurveWallet(pubkey: PublicKey): boolean {
  try {
    return PublicKey.isOnCurve(pubkey.toBytes());
  } catch {
    return false;
  }
}

function parseU64LE(buf: Buffer, offset: number): bigint {
  return buf.readBigUInt64LE(offset);
}

function decodeOwnerAndAmountFromDataSlice(data: unknown): { owner: string; amountRaw: bigint } | null {
  try {
    if (Buffer.isBuffer(data)) {
      if (data.length < 40) return null;
      const owner = new PublicKey(data.subarray(0, 32)).toBase58();
      const amountRaw = parseU64LE(data, 32);
      return { owner, amountRaw };
    }

    if (Array.isArray(data) && typeof data[0] === "string") {
      const b = Buffer.from(data[0], "base64");
      if (b.length < 40) return null;
      const owner = new PublicKey(b.subarray(0, 32)).toBase58();
      const amountRaw = parseU64LE(b, 32);
      return { owner, amountRaw };
    }

    return null;
  } catch {
    return null;
  }
}

async function getOrCreateWeekEpoch(input: {
  epochNumber: number;
  startAtUnix: number;
  endAtUnix: number;
}): Promise<HodlrEpochRecord> {
  await ensureHodlrSchema();
  if (!hasDatabase()) throw new Error("Database not available");

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [`hodlr_epoch_week:${input.epochNumber}`]);

    const existing = await client.query(
      "select * from public.hodlr_epochs where epoch_number=$1 limit 1",
      [input.epochNumber]
    );
    if (existing.rows?.[0]) {
      await client.query("commit");
      return {
        id: String(existing.rows[0].id),
        epochNumber: Number(existing.rows[0].epoch_number),
        startAtUnix: Number(existing.rows[0].start_at_unix),
        endAtUnix: Number(existing.rows[0].end_at_unix),
        status: String(existing.rows[0].status) as any,
        createdAtUnix: Number(existing.rows[0].created_at_unix),
        updatedAtUnix: Number(existing.rows[0].updated_at_unix),
        finalizedAtUnix: existing.rows[0].finalized_at_unix == null ? null : Number(existing.rows[0].finalized_at_unix),
      };
    }

    const created = await createHodlrEpoch({
      epochNumber: input.epochNumber,
      startAtUnix: input.startAtUnix,
      endAtUnix: input.endAtUnix,
      status: "snapshotting",
    });

    await client.query("commit");
    return created;
  } catch (e) {
    try {
      await client.query("rollback");
    } catch {
    }

    const fallback = await getHodlrEpochByNumber(input.epochNumber);
    if (fallback) return fallback;

    throw e;
  } finally {
    client.release();
  }
}

export async function runHodlrSnapshotShadow(): Promise<{
  ok: true;
  skipped?: boolean;
  reason?: string;
  epochId?: string;
  epochNumber?: number;
  snapshotAtUnix?: number;
  holders?: number;
  holdersQualified?: number;
  tokenAccounts?: number;
  snapshotsInserted?: number;
  holdersExitedToZero?: number;
}> {
  if (!isHodlrShadowMode()) {
    return { ok: true, skipped: true, reason: "HODLR shadow mode disabled" };
  }

  if (!hasDatabase()) {
    return { ok: true, skipped: true, reason: "Database not available" };
  }

  const mintRaw = await resolveHodlrMintRaw();
  if (!mintRaw) {
    return { ok: true, skipped: true, reason: "Missing HODLR_TOKEN_MINT" };
  }

  let mint: PublicKey;
  try {
    mint = new PublicKey(mintRaw);
  } catch {
    return { ok: true, skipped: true, reason: "Invalid HODLR_TOKEN_MINT" };
  }

  const connection = getConnection();

  const snapshotAtUnix = await getChainUnixTime(connection);
  const weekStartUnix = getWeekStartUnixFromUnix(snapshotAtUnix);
  const weekEndUnix = weekStartUnix + 7 * 24 * 60 * 60;
  const epochNumber = Math.floor(weekStartUnix / (7 * 24 * 60 * 60));

  const epoch = await getOrCreateWeekEpoch({
    epochNumber,
    startAtUnix: weekStartUnix,
    endAtUnix: weekEndUnix,
  });

  const pool = getPool();
  const lockClient = await pool.connect();
  let lockAcquired = false;
  try {
    const lockKey = `hodlr_snapshot_run:${epoch.id}`;
    const lockRes = await lockClient.query("select pg_try_advisory_lock(hashtext($1)) as ok", [lockKey]);
    lockAcquired = Boolean(lockRes.rows?.[0]?.ok);
    if (!lockAcquired) {
      return { ok: true, skipped: true, reason: "Snapshot already running", epochId: epoch.id, epochNumber };
    }

    if (epoch.status !== "draft" && epoch.status !== "snapshotting") {
      return { ok: true, skipped: true, reason: `Epoch not snapshotting (${epoch.status})`, epochId: epoch.id, epochNumber };
    }

    const already = await pool.query(
      `select 1 from public.hodlr_snapshots where epoch_id=$1 limit 1`,
      [epoch.id]
    );
    if ((already.rows ?? []).length) {
      return { ok: true, skipped: true, reason: "Snapshot already exists for epoch", epochId: epoch.id, epochNumber };
    }

    const tokenProgram = await getTokenProgramIdForMint({ connection, mint });

    const filters = [{ memcmp: { offset: 0, bytes: mint.toBase58() } }];

    const accounts = await withRetry(() =>
      connection.getProgramAccounts(tokenProgram, {
        commitment: "confirmed",
        dataSlice: { offset: 32, length: 40 },
        filters,
        encoding: "base64",
      } as any)
    );

    const programAccounts: Array<{ pubkey: PublicKey; account: any }> = Array.isArray(accounts)
      ? (accounts as any)
      : Array.isArray((accounts as any)?.value)
        ? ((accounts as any).value as any)
        : [];

    const balanceByOwner = new Map<string, bigint>();

    for (const a of programAccounts) {
      const slice = (a as any)?.account?.data;
      const decoded = decodeOwnerAndAmountFromDataSlice(slice);
      if (!decoded) continue;
      if (decoded.amountRaw <= 0n) continue;
      const prev = balanceByOwner.get(decoded.owner) ?? 0n;
      balanceByOwner.set(decoded.owner, prev + decoded.amountRaw);
    }

    const holders = Array.from(balanceByOwner.entries())
      .map(([walletPubkey, balance]) => ({ walletPubkey, balanceRaw: balance.toString() }))
      .sort((a, b) => (a.walletPubkey < b.walletPubkey ? -1 : a.walletPubkey > b.walletPubkey ? 1 : 0));

    const excludedWallets = getExcludedWallets();
    const minBalanceRaw = getMinBalanceRaw();
    const excludeOffCurve = shouldExcludeOffCurveWallets();

    const qualified = holders.filter((h) => {
      const walletPubkey = String(h.walletPubkey ?? "").trim();
      if (!walletPubkey) return false;
      if (excludedWallets.has(walletPubkey)) return false;
      let pk: PublicKey;
      try {
        pk = new PublicKey(walletPubkey);
      } catch {
        return false;
      }
      if (excludeOffCurve && !isOnCurveWallet(pk)) return false;

      let bal = 0n;
      try {
        bal = BigInt(String(h.balanceRaw ?? "0"));
      } catch {
        bal = 0n;
      }
      if (bal < minBalanceRaw) return false;
      return true;
    });

    const holderRows = qualified.map((h) => ({
      walletPubkey: h.walletPubkey,
      firstSeenUnix: snapshotAtUnix,
      lastBalanceRaw: h.balanceRaw,
    }));

    const CHUNK = 5000;
    for (let i = 0; i < holderRows.length; i += CHUNK) {
      const chunk = holderRows.slice(i, i + CHUNK);
      await bulkUpsertHodlrHolderState({ rows: chunk, updatedAtUnix: snapshotAtUnix });
    }

    const exited = await markHodlrHolderStateNotSeenAsZero({ seenAtUnix: snapshotAtUnix });

    const snapshotRows = qualified.map((h) => ({
      walletPubkey: h.walletPubkey,
      balanceRaw: h.balanceRaw,
    }));

    let insertedTotal = 0;
    for (let i = 0; i < snapshotRows.length; i += CHUNK) {
      const chunk = snapshotRows.slice(i, i + CHUNK);
      const r = await insertHodlrSnapshotBalancesBulk({ epochId: epoch.id, snapshotAtUnix, rows: chunk });
      insertedTotal += r.inserted;
    }

    await updateHodlrEpochStatus({ epochId: epoch.id, status: "finalized", finalizedAtUnix: snapshotAtUnix });

    return {
      ok: true,
      epochId: epoch.id,
      epochNumber,
      snapshotAtUnix,
      holders: holders.length,
      holdersQualified: qualified.length,
      tokenAccounts: programAccounts.length,
      snapshotsInserted: insertedTotal,
      holdersExitedToZero: exited.updated,
    };
  } finally {
    if (lockAcquired) {
      try {
        const lockKey = `hodlr_snapshot_run:${epoch.id}`;
        await lockClient.query("select pg_advisory_unlock(hashtext($1))", [lockKey]);
      } catch {
      }
    }
    lockClient.release();
  }
}

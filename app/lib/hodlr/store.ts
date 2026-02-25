import crypto from "crypto";

import { getPool, hasDatabase } from "../db";
import type {
  HodlrDistributionRecord,
  HodlrEpochRecord,
  HodlrEpochStatus,
  HodlrHolderStateRecord,
  HodlrRankingRecord,
  HodlrSnapshotRecord,
} from "./types";

let ensuredHodlrSchema: Promise<void> | null = null;
let ensuredHodlrSchemaVersion = 0;
const HODLR_SCHEMA_VERSION = 4;

function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

function newId(): string {
  return crypto.randomUUID();
}

export async function ensureHodlrSchema(): Promise<void> {
  if (!hasDatabase()) return;
  if (ensuredHodlrSchema && ensuredHodlrSchemaVersion === HODLR_SCHEMA_VERSION) return ensuredHodlrSchema;

  ensuredHodlrSchema = (async () => {
    const pool = getPool();
    await pool.query(`
      create table if not exists public.hodlr_epochs (
        id text primary key,
        epoch_number integer not null,
        start_at_unix bigint not null,
        end_at_unix bigint not null,
        status text not null,
        created_at_unix bigint not null,
        updated_at_unix bigint not null,
        finalized_at_unix bigint null
      );
      create unique index if not exists hodlr_epochs_epoch_number_idx on public.hodlr_epochs(epoch_number);
      create index if not exists hodlr_epochs_status_idx on public.hodlr_epochs(status);
      create index if not exists hodlr_epochs_end_idx on public.hodlr_epochs(end_at_unix);

      create table if not exists public.hodlr_holder_state (
        wallet_pubkey text primary key,
        first_seen_unix bigint not null,
        last_balance_raw text not null,
        updated_at_unix bigint not null
      );
      create index if not exists hodlr_holder_state_updated_idx on public.hodlr_holder_state(updated_at_unix);

      create table if not exists public.hodlr_snapshots (
        epoch_id text not null references public.hodlr_epochs(id),
        wallet_pubkey text not null,
        balance_raw text not null,
        first_seen_unix bigint not null,
        snapshot_at_unix bigint not null,
        primary key (epoch_id, wallet_pubkey)
      );
      create index if not exists hodlr_snapshots_epoch_idx on public.hodlr_snapshots(epoch_id);
      create index if not exists hodlr_snapshots_wallet_idx on public.hodlr_snapshots(wallet_pubkey);

      create table if not exists public.hodlr_rankings (
        epoch_id text not null references public.hodlr_epochs(id),
        wallet_pubkey text not null,
        rank integer not null,
        holding_days double precision not null,
        balance_raw text not null,
        weight double precision not null,
        share_bps integer not null,
        computed_at_unix bigint not null,
        primary key (epoch_id, wallet_pubkey)
      );
      create unique index if not exists hodlr_rankings_epoch_rank_idx on public.hodlr_rankings(epoch_id, rank);
      create index if not exists hodlr_rankings_epoch_idx on public.hodlr_rankings(epoch_id);

      create table if not exists public.hodlr_distributions (
        epoch_id text not null references public.hodlr_epochs(id),
        wallet_pubkey text not null,
        amount_lamports text not null,
        created_at_unix bigint not null,
        primary key (epoch_id, wallet_pubkey)
      );
      create index if not exists hodlr_distributions_epoch_idx on public.hodlr_distributions(epoch_id);

      create table if not exists public.hodlr_payout_dry_runs (
        epoch_id text primary key references public.hodlr_epochs(id),
        source_pubkey text not null,
        source_balance_lamports text not null,
        total_lamports text not null,
        recipient_count integer not null,
        created_at_unix bigint not null
      );
      create index if not exists hodlr_payout_dry_runs_created_idx on public.hodlr_payout_dry_runs(created_at_unix);

      create table if not exists public.hodlr_payout_dry_run_items (
        epoch_id text not null references public.hodlr_epochs(id),
        wallet_pubkey text not null,
        amount_lamports text not null,
        primary key (epoch_id, wallet_pubkey)
      );
      create index if not exists hodlr_payout_dry_run_items_epoch_idx on public.hodlr_payout_dry_run_items(epoch_id);

      create table if not exists public.hodlr_reward_claims (
        id text primary key,
        epoch_id text not null references public.hodlr_epochs(id),
        wallet_pubkey text not null,
        amount_lamports text not null,
        tx_sig text null,
        status text not null,
        claimed_at_unix bigint not null,
        created_at_unix bigint not null,
        updated_at_unix bigint not null
      );
      create unique index if not exists hodlr_reward_claims_epoch_wallet_idx on public.hodlr_reward_claims(epoch_id, wallet_pubkey);
      create index if not exists hodlr_reward_claims_wallet_idx on public.hodlr_reward_claims(wallet_pubkey);
      create index if not exists hodlr_reward_claims_status_idx on public.hodlr_reward_claims(status);

      create table if not exists public.hodlr_escrow_wallets (
        id text primary key,
        privy_wallet_id text not null,
        wallet_pubkey text not null,
        created_at_unix bigint not null
      );
      create unique index if not exists hodlr_escrow_wallets_pubkey_idx on public.hodlr_escrow_wallets(wallet_pubkey);
    `);
    ensuredHodlrSchemaVersion = HODLR_SCHEMA_VERSION;
  })().catch((e) => {
    ensuredHodlrSchema = null;
    ensuredHodlrSchemaVersion = 0;
    throw e;
  });

  return ensuredHodlrSchema;
}

function rowToEpoch(row: any): HodlrEpochRecord {
  return {
    id: String(row.id),
    epochNumber: Number(row.epoch_number),
    startAtUnix: Number(row.start_at_unix),
    endAtUnix: Number(row.end_at_unix),
    status: String(row.status) as HodlrEpochStatus,
    createdAtUnix: Number(row.created_at_unix),
    updatedAtUnix: Number(row.updated_at_unix),
    finalizedAtUnix: row.finalized_at_unix == null ? null : Number(row.finalized_at_unix),
  };
}

function rowToHolderState(row: any): HodlrHolderStateRecord {
  return {
    walletPubkey: String(row.wallet_pubkey),
    firstSeenUnix: Number(row.first_seen_unix),
    lastBalanceRaw: String(row.last_balance_raw),
    updatedAtUnix: Number(row.updated_at_unix),
  };
}

function rowToHodlrEscrowWallet(row: any): HodlrEscrowWalletRecord {
  return {
    id: String(row.id),
    privyWalletId: String(row.privy_wallet_id),
    walletPubkey: String(row.wallet_pubkey),
    createdAtUnix: Number(row.created_at_unix),
  };
}

function rowToSnapshot(row: any): HodlrSnapshotRecord {
  return {
    epochId: String(row.epoch_id),
    walletPubkey: String(row.wallet_pubkey),
    balanceRaw: String(row.balance_raw),
    firstSeenUnix: Number(row.first_seen_unix),
    snapshotAtUnix: Number(row.snapshot_at_unix),
  };
}

function rowToRanking(row: any): HodlrRankingRecord {
  return {
    epochId: String(row.epoch_id),
    walletPubkey: String(row.wallet_pubkey),
    rank: Number(row.rank),
    holdingDays: Number(row.holding_days),
    balanceRaw: String(row.balance_raw),
    weight: Number(row.weight),
    shareBps: Number(row.share_bps),
    computedAtUnix: Number(row.computed_at_unix),
  };
}

function rowToDistribution(row: any): HodlrDistributionRecord {
  return {
    epochId: String(row.epoch_id),
    walletPubkey: String(row.wallet_pubkey),
    amountLamports: String(row.amount_lamports),
    createdAtUnix: Number(row.created_at_unix),
  };
}

type HodlrPayoutDryRunRecord = {
  epochId: string;
  sourcePubkey: string;
  sourceBalanceLamports: string;
  totalLamports: string;
  recipientCount: number;
  createdAtUnix: number;
};

type HodlrRewardClaimStatus = "pending" | "completed";

type HodlrEscrowWalletRecord = {
  id: string;
  privyWalletId: string;
  walletPubkey: string;
  createdAtUnix: number;
};

type HodlrRewardClaimRecord = {
  id: string;
  epochId: string;
  walletPubkey: string;
  amountLamports: string;
  txSig: string | null;
  status: HodlrRewardClaimStatus;
  claimedAtUnix: number;
  createdAtUnix: number;
  updatedAtUnix: number;
};

function rowToPayoutDryRun(row: any): HodlrPayoutDryRunRecord {
  return {
    epochId: String(row.epoch_id),
    sourcePubkey: String(row.source_pubkey),
    sourceBalanceLamports: String(row.source_balance_lamports),
    totalLamports: String(row.total_lamports),
    recipientCount: Number(row.recipient_count),
    createdAtUnix: Number(row.created_at_unix),
  };
}

function rowToHodlrRewardClaim(row: any): HodlrRewardClaimRecord {
  return {
    id: String(row.id),
    epochId: String(row.epoch_id),
    walletPubkey: String(row.wallet_pubkey),
    amountLamports: String(row.amount_lamports),
    txSig: row.tx_sig == null ? null : String(row.tx_sig),
    status: String(row.status) as HodlrRewardClaimStatus,
    claimedAtUnix: Number(row.claimed_at_unix),
    createdAtUnix: Number(row.created_at_unix),
    updatedAtUnix: Number(row.updated_at_unix),
  };
}

export async function createHodlrEpoch(input: {
  epochNumber: number;
  startAtUnix: number;
  endAtUnix: number;
  status?: HodlrEpochStatus;
}): Promise<HodlrEpochRecord> {
  await ensureHodlrSchema();
  if (!hasDatabase()) throw new Error("Database not available");

  const epochNumber = Math.max(1, Math.floor(Number(input.epochNumber) || 0));
  const startAtUnix = Math.floor(Number(input.startAtUnix) || 0);
  const endAtUnix = Math.floor(Number(input.endAtUnix) || 0);
  if (!epochNumber || startAtUnix <= 0 || endAtUnix <= startAtUnix) {
    throw new Error("Invalid epoch params");
  }

  const t = nowUnix();
  const id = newId();
  const status: HodlrEpochStatus = (input.status ?? "draft") as HodlrEpochStatus;

  const pool = getPool();
  const res = await pool.query(
    `insert into public.hodlr_epochs (id, epoch_number, start_at_unix, end_at_unix, status, created_at_unix, updated_at_unix)
     values ($1,$2,$3,$4,$5,$6,$6)
     returning *`,
    [id, epochNumber, String(startAtUnix), String(endAtUnix), String(status), String(t)]
  );

  const row = res.rows?.[0];
  if (!row) throw new Error("Failed to create hodlr epoch");
  return rowToEpoch(row);
}

export async function getHodlrEpochById(id: string): Promise<HodlrEpochRecord | null> {
  await ensureHodlrSchema();
  if (!hasDatabase()) return null;

  const epochId = String(id ?? "").trim();
  if (!epochId) return null;

  const pool = getPool();
  const res = await pool.query("select * from public.hodlr_epochs where id=$1 limit 1", [epochId]);
  const row = res.rows?.[0];
  return row ? rowToEpoch(row) : null;
}

export async function getHodlrEpochByNumber(epochNumberRaw: number): Promise<HodlrEpochRecord | null> {
  await ensureHodlrSchema();
  if (!hasDatabase()) return null;

  const epochNumber = Math.max(1, Math.floor(Number(epochNumberRaw) || 0));
  if (!epochNumber) return null;

  const pool = getPool();
  const res = await pool.query("select * from public.hodlr_epochs where epoch_number=$1 limit 1", [epochNumber]);
  const row = res.rows?.[0];
  return row ? rowToEpoch(row) : null;
}

export async function getLatestHodlrEpoch(): Promise<HodlrEpochRecord | null> {
  await ensureHodlrSchema();
  if (!hasDatabase()) return null;

  const pool = getPool();
  const res = await pool.query(
    `select *
     from public.hodlr_epochs
     order by epoch_number desc
     limit 1`
  );
  const row = res.rows?.[0];
  return row ? rowToEpoch(row) : null;
}

export async function listHodlrEpochs(input?: { limit?: number }): Promise<HodlrEpochRecord[]> {
  await ensureHodlrSchema();
  if (!hasDatabase()) return [];

  const limitRaw = Number(input?.limit ?? 12);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, Math.floor(limitRaw))) : 12;

  const pool = getPool();
  const res = await pool.query(
    `select *
     from public.hodlr_epochs
     order by epoch_number desc
     limit $1`,
    [limit]
  );
  return (res.rows ?? []).map(rowToEpoch);
}

export async function updateHodlrEpochStatus(input: {
  epochId: string;
  status: HodlrEpochStatus;
  finalizedAtUnix?: number | null;
}): Promise<HodlrEpochRecord> {
  await ensureHodlrSchema();
  if (!hasDatabase()) throw new Error("Database not available");

  const epochId = String(input.epochId ?? "").trim();
  if (!epochId) throw new Error("epochId is required");
  const status = String(input.status ?? "").trim() as HodlrEpochStatus;
  if (!status) throw new Error("status is required");

  const t = nowUnix();
  const finalizedAtUnix = input.finalizedAtUnix == null ? null : Math.floor(Number(input.finalizedAtUnix) || 0);

  const pool = getPool();
  const res = await pool.query(
    `update public.hodlr_epochs
     set status=$2, updated_at_unix=$3, finalized_at_unix=coalesce($4, finalized_at_unix)
     where id=$1
     returning *`,
    [epochId, status, String(t), finalizedAtUnix ? String(finalizedAtUnix) : null]
  );
  const row = res.rows?.[0];
  if (!row) throw new Error("HODLR epoch not found");
  return rowToEpoch(row);
}

export async function upsertHodlrHolderState(input: {
  walletPubkey: string;
  firstSeenUnix: number;
  lastBalanceRaw: string;
  updatedAtUnix?: number;
}): Promise<HodlrHolderStateRecord> {
  await ensureHodlrSchema();
  if (!hasDatabase()) throw new Error("Database not available");

  const walletPubkey = String(input.walletPubkey ?? "").trim();
  if (!walletPubkey) throw new Error("walletPubkey is required");

  const firstSeenUnix = Math.floor(Number(input.firstSeenUnix) || 0);
  if (!Number.isFinite(firstSeenUnix) || firstSeenUnix <= 0) {
    throw new Error("firstSeenUnix is required");
  }

  const lastBalanceRaw = String(input.lastBalanceRaw ?? "").trim();
  if (!lastBalanceRaw) throw new Error("lastBalanceRaw is required");

  const t = input.updatedAtUnix == null ? nowUnix() : Math.floor(Number(input.updatedAtUnix) || 0);
  if (!Number.isFinite(t) || t <= 0) throw new Error("updatedAtUnix is invalid");

  const pool = getPool();
  const res = await pool.query(
    `insert into public.hodlr_holder_state (wallet_pubkey, first_seen_unix, last_balance_raw, updated_at_unix)
     values ($1,$2,$3,$4)
     on conflict (wallet_pubkey) do update set
       first_seen_unix = case
         when hodlr_holder_state.last_balance_raw::numeric <= 0
           then excluded.first_seen_unix
         when excluded.last_balance_raw::numeric < hodlr_holder_state.last_balance_raw::numeric
           then excluded.first_seen_unix
         else hodlr_holder_state.first_seen_unix
       end,
       last_balance_raw = excluded.last_balance_raw,
       updated_at_unix = excluded.updated_at_unix
     returning *`,
    [walletPubkey, String(firstSeenUnix), lastBalanceRaw, String(t)]
  );

  const row = res.rows?.[0];
  if (!row) throw new Error("Failed to upsert hodlr holder state");
  return rowToHolderState(row);
}

export async function listHodlrHolderStateByWallets(walletPubkeys: string[]): Promise<HodlrHolderStateRecord[]> {
  await ensureHodlrSchema();
  if (!hasDatabase()) return [];

  const wallets = (walletPubkeys ?? []).map((w) => String(w ?? "").trim()).filter(Boolean);
  if (!wallets.length) return [];

  const pool = getPool();
  const res = await pool.query(
    `select * from public.hodlr_holder_state where wallet_pubkey = any($1::text[])`,
    [wallets]
  );

  return (res.rows ?? []).map(rowToHolderState);
}

export async function bulkUpsertHodlrHolderState(input: {
  rows: Array<{ walletPubkey: string; firstSeenUnix: number; lastBalanceRaw: string }>;
  updatedAtUnix?: number;
}): Promise<{ upserted: number }> {
  await ensureHodlrSchema();
  if (!hasDatabase()) throw new Error("Database not available");

  const rows = Array.isArray(input.rows) ? input.rows : [];
  if (!rows.length) return { upserted: 0 };

  const walletPubkeys: string[] = [];
  const firstSeenUnix: number[] = [];
  const lastBalanceRaw: string[] = [];
  const updatedAtUnix = input.updatedAtUnix == null ? nowUnix() : Math.floor(Number(input.updatedAtUnix) || 0);
  if (!Number.isFinite(updatedAtUnix) || updatedAtUnix <= 0) throw new Error("updatedAtUnix is invalid");

  for (const r of rows) {
    const wallet = String(r.walletPubkey ?? "").trim();
    const firstSeen = Math.floor(Number(r.firstSeenUnix) || 0);
    const bal = String(r.lastBalanceRaw ?? "").trim();
    if (!wallet || firstSeen <= 0 || !bal) continue;
    walletPubkeys.push(wallet);
    firstSeenUnix.push(firstSeen);
    lastBalanceRaw.push(bal);
  }

  if (!walletPubkeys.length) return { upserted: 0 };

  const pool = getPool();
  const res = await pool.query(
    `insert into public.hodlr_holder_state (wallet_pubkey, first_seen_unix, last_balance_raw, updated_at_unix)
     select * from unnest($1::text[], $2::bigint[], $3::text[], $4::bigint[])
     on conflict (wallet_pubkey) do update set
       first_seen_unix = case
         when hodlr_holder_state.last_balance_raw::numeric <= 0
           then excluded.first_seen_unix
         when excluded.last_balance_raw::numeric < hodlr_holder_state.last_balance_raw::numeric
           then excluded.first_seen_unix
         else hodlr_holder_state.first_seen_unix
       end,
       last_balance_raw = excluded.last_balance_raw,
       updated_at_unix = excluded.updated_at_unix`,
    [walletPubkeys, firstSeenUnix, lastBalanceRaw, walletPubkeys.map(() => updatedAtUnix)]
  );

  const count = (res as any)?.rowCount;
  return { upserted: Number.isFinite(count) ? Number(count) : walletPubkeys.length };
}

export async function markHodlrHolderStateNotSeenAsZero(input: { seenAtUnix: number }): Promise<{ updated: number }> {
  await ensureHodlrSchema();
  if (!hasDatabase()) throw new Error("Database not available");

  const seenAtUnix = Math.floor(Number(input.seenAtUnix) || 0);
  if (!Number.isFinite(seenAtUnix) || seenAtUnix <= 0) throw new Error("seenAtUnix is required");

  const pool = getPool();
  const res = await pool.query(
    `update public.hodlr_holder_state
     set last_balance_raw = '0',
         first_seen_unix = $1,
         updated_at_unix = $1
     where updated_at_unix < $1
       and last_balance_raw::numeric > 0`,
    [String(seenAtUnix)]
  );

  const updated = res.rowCount ?? 0;
  return { updated: Number.isFinite(updated) ? Number(updated) : 0 };
}

export async function markHodlrRewardClaimsCompletedBatch(input: {
  walletPubkey: string;
  epochIds: string[];
  txSig: string;
}): Promise<{ updated: number }> {
  await ensureHodlrSchema();
  if (!hasDatabase()) throw new Error("Database not available");

  const walletPubkey = String(input.walletPubkey ?? "").trim();
  const epochIds = (input.epochIds ?? []).map((e) => String(e ?? "").trim()).filter(Boolean);
  const txSig = String(input.txSig ?? "").trim();
  if (!walletPubkey || !epochIds.length || !txSig) return { updated: 0 };

  const t = nowUnix();
  const pool = getPool();
  const res = await pool.query(
    `update public.hodlr_reward_claims
     set status='completed', tx_sig=$3, updated_at_unix=$4
     where wallet_pubkey=$1
       and epoch_id = any($2::text[])
       and status='pending'`,
    [walletPubkey, epochIds, txSig, String(t)]
  );

  const updated = res.rowCount ?? 0;
  return { updated: Number.isFinite(updated) ? Number(updated) : 0 };
}

export async function getHodlrEscrowWallet(): Promise<HodlrEscrowWalletRecord | null> {
  await ensureHodlrSchema();
  if (!hasDatabase()) return null;

  const pool = getPool();
  const res = await pool.query(`select * from public.hodlr_escrow_wallets order by created_at_unix desc limit 1`);
  const row = res.rows?.[0];
  return row ? rowToHodlrEscrowWallet(row) : null;
}

export async function insertHodlrSnapshotRows(input: {
  epochId: string;
  snapshotAtUnix: number;
  rows: Array<{ walletPubkey: string; balanceRaw: string; firstSeenUnix: number }>;
}): Promise<{ inserted: number }> {
  await ensureHodlrSchema();
  if (!hasDatabase()) throw new Error("Database not available");

  const epochId = String(input.epochId ?? "").trim();
  if (!epochId) throw new Error("epochId is required");

  const snapshotAtUnix = Math.floor(Number(input.snapshotAtUnix) || 0);
  if (!Number.isFinite(snapshotAtUnix) || snapshotAtUnix <= 0) throw new Error("snapshotAtUnix is required");

  const rows = Array.isArray(input.rows) ? input.rows : [];
  if (rows.length === 0) return { inserted: 0 };

  const pool = getPool();

  let inserted = 0;
  for (const r of rows) {
    const walletPubkey = String(r.walletPubkey ?? "").trim();
    const balanceRaw = String(r.balanceRaw ?? "").trim();
    const firstSeenUnix = Math.floor(Number(r.firstSeenUnix) || 0);
    if (!walletPubkey || !balanceRaw || firstSeenUnix <= 0) continue;

    const res = await pool.query(
      `insert into public.hodlr_snapshots (epoch_id, wallet_pubkey, balance_raw, first_seen_unix, snapshot_at_unix)
       values ($1,$2,$3,$4,$5)
       on conflict (epoch_id, wallet_pubkey) do nothing
       returning epoch_id`,
      [epochId, walletPubkey, balanceRaw, String(firstSeenUnix), String(snapshotAtUnix)]
    );

    if (res.rows?.[0]) inserted += 1;
  }

  return { inserted };
}

export async function insertHodlrDistributionsIfAbsent(input: {
  epochId: string;
  rows: Array<{ walletPubkey: string; amountLamports: string }>;
  createdAtUnix?: number;
}): Promise<{ inserted: number; skipped: boolean }> {
  await ensureHodlrSchema();
  if (!hasDatabase()) throw new Error("Database not available");

  const epochId = String(input.epochId ?? "").trim();
  if (!epochId) throw new Error("epochId is required");

  const pool = getPool();
  const existing = await pool.query(
    `select 1 from public.hodlr_distributions where epoch_id=$1 limit 1`,
    [epochId]
  );
  if ((existing.rows ?? []).length) return { inserted: 0, skipped: true };

  const createdAtUnix = Math.floor(Number(input.createdAtUnix ?? nowUnix()));

  let inserted = 0;
  for (const r of input.rows ?? []) {
    const walletPubkey = String(r.walletPubkey ?? "").trim();
    const amountLamports = String(r.amountLamports ?? "").trim();
    if (!walletPubkey || !amountLamports) continue;

    const res = await pool.query(
      `insert into public.hodlr_distributions (epoch_id, wallet_pubkey, amount_lamports, created_at_unix)
       values ($1,$2,$3,$4)
       on conflict (epoch_id, wallet_pubkey) do nothing
       returning epoch_id`,
      [epochId, walletPubkey, amountLamports, String(createdAtUnix)]
    );
    if (res.rows?.[0]) inserted += 1;
  }

  return { inserted, skipped: false };
}

export async function insertHodlrRankingsIfAbsent(input: {
  epochId: string;
  rows: Array<Omit<HodlrRankingRecord, "computedAtUnix">>;
  computedAtUnix?: number;
}): Promise<{ inserted: number; skipped: boolean }> {
  await ensureHodlrSchema();
  if (!hasDatabase()) throw new Error("Database not available");

  const epochId = String(input.epochId ?? "").trim();
  if (!epochId) throw new Error("epochId is required");

  const pool = getPool();
  const existing = await pool.query(
    `select 1 from public.hodlr_rankings where epoch_id=$1 limit 1`,
    [epochId]
  );
  if ((existing.rows ?? []).length) return { inserted: 0, skipped: true };

  const computedAtUnix = Math.floor(Number(input.computedAtUnix ?? nowUnix()));

  let inserted = 0;
  for (const r of input.rows ?? []) {
    const walletPubkey = String((r as any)?.walletPubkey ?? "").trim();
    const rank = Math.max(1, Math.floor(Number((r as any)?.rank) || 0));
    const holdingDays = Number((r as any)?.holdingDays);
    const balanceRaw = String((r as any)?.balanceRaw ?? "").trim();
    const weight = Number((r as any)?.weight);
    const shareBps = Math.max(0, Math.floor(Number((r as any)?.shareBps) || 0));

    if (!walletPubkey || !Number.isFinite(holdingDays) || !balanceRaw || !Number.isFinite(weight)) continue;

    const res = await pool.query(
      `insert into public.hodlr_rankings (epoch_id, wallet_pubkey, rank, holding_days, balance_raw, weight, share_bps, computed_at_unix)
       values ($1,$2,$3,$4,$5,$6,$7,$8)
       on conflict (epoch_id, wallet_pubkey) do nothing
       returning epoch_id`,
      [epochId, walletPubkey, rank, holdingDays, balanceRaw, weight, shareBps, String(computedAtUnix)]
    );

    if (res.rows?.[0]) inserted += 1;
  }

  return { inserted, skipped: false };
}

export async function insertHodlrSnapshotRowsBulk(input: {
  epochId: string;
  snapshotAtUnix: number;
  rows: Array<{ walletPubkey: string; balanceRaw: string; firstSeenUnix: number }>;
}): Promise<{ inserted: number }> {
  await ensureHodlrSchema();
  if (!hasDatabase()) throw new Error("Database not available");

  const epochId = String(input.epochId ?? "").trim();
  if (!epochId) throw new Error("epochId is required");

  const snapshotAtUnix = Math.floor(Number(input.snapshotAtUnix) || 0);
  if (!Number.isFinite(snapshotAtUnix) || snapshotAtUnix <= 0) throw new Error("snapshotAtUnix is required");

  const rows = Array.isArray(input.rows) ? input.rows : [];
  if (!rows.length) return { inserted: 0 };

  const walletPubkeys: string[] = [];
  const balanceRaw: string[] = [];
  const firstSeenUnix: number[] = [];
  const snapshotAtUnixArr: number[] = [];

  for (const r of rows) {
    const wallet = String(r.walletPubkey ?? "").trim();
    const bal = String(r.balanceRaw ?? "").trim();
    const fs = Math.floor(Number(r.firstSeenUnix) || 0);
    if (!wallet || !bal || fs <= 0) continue;
    walletPubkeys.push(wallet);
    balanceRaw.push(bal);
    firstSeenUnix.push(fs);
    snapshotAtUnixArr.push(snapshotAtUnix);
  }

  if (!walletPubkeys.length) return { inserted: 0 };

  const pool = getPool();
  const res = await pool.query(
    `insert into public.hodlr_snapshots (epoch_id, wallet_pubkey, balance_raw, first_seen_unix, snapshot_at_unix)
     select $1, t.wallet_pubkey, t.balance_raw, t.first_seen_unix, t.snapshot_at_unix
     from unnest($2::text[], $3::text[], $4::bigint[], $5::bigint[]) as t(wallet_pubkey, balance_raw, first_seen_unix, snapshot_at_unix)
     on conflict (epoch_id, wallet_pubkey) do nothing`,
    [epochId, walletPubkeys, balanceRaw, firstSeenUnix, snapshotAtUnixArr]
  );

  const count = (res as any)?.rowCount;
  return { inserted: Number.isFinite(count) ? Number(count) : 0 };
}

export async function insertHodlrSnapshotBalancesBulk(input: {
  epochId: string;
  snapshotAtUnix: number;
  rows: Array<{ walletPubkey: string; balanceRaw: string }>;
}): Promise<{ inserted: number }> {
  await ensureHodlrSchema();
  if (!hasDatabase()) throw new Error("Database not available");

  const epochId = String(input.epochId ?? "").trim();
  if (!epochId) throw new Error("epochId is required");

  const snapshotAtUnix = Math.floor(Number(input.snapshotAtUnix) || 0);
  if (!Number.isFinite(snapshotAtUnix) || snapshotAtUnix <= 0) throw new Error("snapshotAtUnix is required");

  const rows = Array.isArray(input.rows) ? input.rows : [];
  if (!rows.length) return { inserted: 0 };

  const walletPubkeys: string[] = [];
  const balanceRaw: string[] = [];

  for (const r of rows) {
    const wallet = String(r.walletPubkey ?? "").trim();
    const bal = String(r.balanceRaw ?? "").trim();
    if (!wallet || !bal) continue;
    walletPubkeys.push(wallet);
    balanceRaw.push(bal);
  }

  if (!walletPubkeys.length) return { inserted: 0 };

  const pool = getPool();
  const res = await pool.query(
    `insert into public.hodlr_snapshots (epoch_id, wallet_pubkey, balance_raw, first_seen_unix, snapshot_at_unix)
     select $1, t.wallet_pubkey, t.balance_raw, s.first_seen_unix, $2
     from unnest($3::text[], $4::text[]) as t(wallet_pubkey, balance_raw)
     join public.hodlr_holder_state s on s.wallet_pubkey = t.wallet_pubkey
     on conflict (epoch_id, wallet_pubkey) do nothing`,
    [epochId, snapshotAtUnix, walletPubkeys, balanceRaw]
  );

  const count = (res as any)?.rowCount;
  return { inserted: Number.isFinite(count) ? Number(count) : 0 };
}

export async function listHodlrSnapshotsByEpoch(epochIdRaw: string): Promise<HodlrSnapshotRecord[]> {
  await ensureHodlrSchema();
  if (!hasDatabase()) return [];

  const epochId = String(epochIdRaw ?? "").trim();
  if (!epochId) return [];

  const pool = getPool();
  const res = await pool.query(
    `select * from public.hodlr_snapshots where epoch_id=$1 order by wallet_pubkey asc`,
    [epochId]
  );
  return (res.rows ?? []).map(rowToSnapshot);
}

export async function replaceHodlrRankings(input: {
  epochId: string;
  rows: Array<Omit<HodlrRankingRecord, "computedAtUnix">>;
  computedAtUnix?: number;
}): Promise<{ inserted: number }> {
  await ensureHodlrSchema();
  if (!hasDatabase()) throw new Error("Database not available");

  const epochId = String(input.epochId ?? "").trim();
  if (!epochId) throw new Error("epochId is required");

  const computedAtUnix = Math.floor(Number(input.computedAtUnix ?? nowUnix()));

  const pool = getPool();
  await pool.query("delete from public.hodlr_rankings where epoch_id=$1", [epochId]);

  let inserted = 0;
  for (const r of input.rows ?? []) {
    const walletPubkey = String((r as any)?.walletPubkey ?? "").trim();
    const rank = Math.max(1, Math.floor(Number((r as any)?.rank) || 0));
    const holdingDays = Number((r as any)?.holdingDays);
    const balanceRaw = String((r as any)?.balanceRaw ?? "").trim();
    const weight = Number((r as any)?.weight);
    const shareBps = Math.max(0, Math.floor(Number((r as any)?.shareBps) || 0));

    if (!walletPubkey || !Number.isFinite(holdingDays) || !balanceRaw || !Number.isFinite(weight)) continue;

    const res = await pool.query(
      `insert into public.hodlr_rankings (epoch_id, wallet_pubkey, rank, holding_days, balance_raw, weight, share_bps, computed_at_unix)
       values ($1,$2,$3,$4,$5,$6,$7,$8)
       returning epoch_id`,
      [epochId, walletPubkey, rank, holdingDays, balanceRaw, weight, shareBps, String(computedAtUnix)]
    );

    if (res.rows?.[0]) inserted += 1;
  }

  return { inserted };
}

export async function listHodlrRankings(epochIdRaw: string): Promise<HodlrRankingRecord[]> {
  await ensureHodlrSchema();
  if (!hasDatabase()) return [];

  const epochId = String(epochIdRaw ?? "").trim();
  if (!epochId) return [];

  const pool = getPool();
  const res = await pool.query(
    `select * from public.hodlr_rankings where epoch_id=$1 order by rank asc, wallet_pubkey asc`,
    [epochId]
  );
  return (res.rows ?? []).map(rowToRanking);
}

export async function replaceHodlrDistributions(input: {
  epochId: string;
  rows: Array<{ walletPubkey: string; amountLamports: string }>;
  createdAtUnix?: number;
}): Promise<{ inserted: number }> {
  await ensureHodlrSchema();
  if (!hasDatabase()) throw new Error("Database not available");

  const epochId = String(input.epochId ?? "").trim();
  if (!epochId) throw new Error("epochId is required");

  const createdAtUnix = Math.floor(Number(input.createdAtUnix ?? nowUnix()));

  const pool = getPool();
  await pool.query("delete from public.hodlr_distributions where epoch_id=$1", [epochId]);

  let inserted = 0;
  for (const r of input.rows ?? []) {
    const walletPubkey = String(r.walletPubkey ?? "").trim();
    const amountLamports = String(r.amountLamports ?? "").trim();
    if (!walletPubkey || !amountLamports) continue;

    const res = await pool.query(
      `insert into public.hodlr_distributions (epoch_id, wallet_pubkey, amount_lamports, created_at_unix)
       values ($1,$2,$3,$4)
       returning epoch_id`,
      [epochId, walletPubkey, amountLamports, String(createdAtUnix)]
    );
    if (res.rows?.[0]) inserted += 1;
  }

  return { inserted };
}

export async function listHodlrDistributions(epochIdRaw: string): Promise<HodlrDistributionRecord[]> {
  await ensureHodlrSchema();
  if (!hasDatabase()) return [];

  const epochId = String(epochIdRaw ?? "").trim();
  if (!epochId) return [];

  const pool = getPool();
  const res = await pool.query(
    `select * from public.hodlr_distributions where epoch_id=$1 order by wallet_pubkey asc`,
    [epochId]
  );
  return (res.rows ?? []).map(rowToDistribution);
}

export async function getHodlrPayoutDryRun(epochIdRaw: string): Promise<HodlrPayoutDryRunRecord | null> {
  await ensureHodlrSchema();
  if (!hasDatabase()) return null;

  const epochId = String(epochIdRaw ?? "").trim();
  if (!epochId) return null;

  const pool = getPool();
  const res = await pool.query(
    `select * from public.hodlr_payout_dry_runs where epoch_id=$1 limit 1`,
    [epochId]
  );
  const row = res.rows?.[0];
  return row ? rowToPayoutDryRun(row) : null;
}

export async function listHodlrPayoutDryRunItems(epochIdRaw: string): Promise<Array<{ walletPubkey: string; amountLamports: string }>> {
  await ensureHodlrSchema();
  if (!hasDatabase()) return [];

  const epochId = String(epochIdRaw ?? "").trim();
  if (!epochId) return [];

  const pool = getPool();
  const res = await pool.query(
    `select wallet_pubkey, amount_lamports
     from public.hodlr_payout_dry_run_items
     where epoch_id=$1
     order by wallet_pubkey asc`,
    [epochId]
  );

  return (res.rows ?? []).map((r) => ({
    walletPubkey: String(r.wallet_pubkey),
    amountLamports: String(r.amount_lamports),
  }));
}

export async function listHodlrClaimableDistributionsByWallet(input: {
  walletPubkey: string;
  epochId?: string;
}): Promise<Array<{ epochId: string; epochNumber: number; amountLamports: string }>> {
  await ensureHodlrSchema();
  if (!hasDatabase()) return [];

  const walletPubkey = String(input.walletPubkey ?? "").trim();
  if (!walletPubkey) return [];
  const epochId = String(input.epochId ?? "").trim();

  const pool = getPool();
  const res = await pool.query(
    `select d.epoch_id, e.epoch_number, d.amount_lamports
     from public.hodlr_distributions d
     join public.hodlr_epochs e on e.id = d.epoch_id
     left join public.hodlr_reward_claims c
       on c.epoch_id = d.epoch_id
      and c.wallet_pubkey = d.wallet_pubkey
     where d.wallet_pubkey = $1
       and e.status = 'claim_open'
       and ($2 = '' or d.epoch_id = $2)
       and c.epoch_id is null
     order by e.epoch_number asc`,
    [walletPubkey, epochId]
  );

  return (res.rows ?? []).map((r) => ({
    epochId: String(r.epoch_id),
    epochNumber: Number(r.epoch_number),
    amountLamports: String(r.amount_lamports),
  }));
}

export async function listHodlrClaimableDistributionsByWalletAndEpochIds(input: {
  walletPubkey: string;
  epochIds: string[];
}): Promise<Array<{ epochId: string; epochNumber: number; amountLamports: string }>> {
  await ensureHodlrSchema();
  if (!hasDatabase()) return [];

  const walletPubkey = String(input.walletPubkey ?? "").trim();
  const epochIds = (input.epochIds ?? []).map((e) => String(e ?? "").trim()).filter(Boolean);
  if (!walletPubkey || !epochIds.length) return [];

  const pool = getPool();
  const res = await pool.query(
    `select d.epoch_id, e.epoch_number, d.amount_lamports
     from public.hodlr_distributions d
     join public.hodlr_epochs e on e.id = d.epoch_id
     left join public.hodlr_reward_claims c
       on c.epoch_id = d.epoch_id
      and c.wallet_pubkey = d.wallet_pubkey
     where d.wallet_pubkey = $1
       and d.epoch_id = any($2::text[])
       and e.status = 'claim_open'
       and c.epoch_id is null
     order by e.epoch_number asc`,
    [walletPubkey, epochIds]
  );

  return (res.rows ?? []).map((r) => ({
    epochId: String(r.epoch_id),
    epochNumber: Number(r.epoch_number),
    amountLamports: String(r.amount_lamports),
  }));
}

export async function getHodlrRewardClaim(input: {
  epochId: string;
  walletPubkey: string;
}): Promise<HodlrRewardClaimRecord | null> {
  await ensureHodlrSchema();
  if (!hasDatabase()) return null;

  const epochId = String(input.epochId ?? "").trim();
  const walletPubkey = String(input.walletPubkey ?? "").trim();
  if (!epochId || !walletPubkey) return null;

  const pool = getPool();
  const res = await pool.query(
    `select * from public.hodlr_reward_claims where epoch_id=$1 and wallet_pubkey=$2 limit 1`,
    [epochId, walletPubkey]
  );
  const row = res.rows?.[0];
  return row ? rowToHodlrRewardClaim(row) : null;
}

export async function listHodlrPendingRewardClaimsByWallet(input: {
  walletPubkey: string;
}): Promise<HodlrRewardClaimRecord[]> {
  await ensureHodlrSchema();
  if (!hasDatabase()) return [];

  const walletPubkey = String(input.walletPubkey ?? "").trim();
  if (!walletPubkey) return [];

  const pool = getPool();
  const res = await pool.query(
    `select *
     from public.hodlr_reward_claims
     where wallet_pubkey=$1
       and status='pending'
     order by claimed_at_unix desc`,
    [walletPubkey]
  );
  return (res.rows ?? []).map(rowToHodlrRewardClaim);
}

export async function deleteStaleHodlrPendingRewardClaimsByWallet(input: {
  walletPubkey: string;
  staleBeforeUnix: number;
}): Promise<{ deleted: number }> {
  await ensureHodlrSchema();
  if (!hasDatabase()) throw new Error("Database not available");

  const walletPubkey = String(input.walletPubkey ?? "").trim();
  const staleBeforeUnix = Math.floor(Number(input.staleBeforeUnix) || 0);
  if (!walletPubkey || staleBeforeUnix <= 0) return { deleted: 0 };

  const pool = getPool();
  const res = await pool.query(
    `delete from public.hodlr_reward_claims
     where wallet_pubkey=$1
       and status='pending'
       and claimed_at_unix < $2`,
    [walletPubkey, String(staleBeforeUnix)]
  );
  const deleted = res.rowCount ?? 0;
  return { deleted: Number.isFinite(deleted) ? Number(deleted) : 0 };
}

export async function deleteHodlrPendingRewardClaimByTxSig(input: {
  epochId: string;
  walletPubkey: string;
  txSig: string;
}): Promise<{ deleted: number }> {
  await ensureHodlrSchema();
  if (!hasDatabase()) throw new Error("Database not available");

  const epochId = String(input.epochId ?? "").trim();
  const walletPubkey = String(input.walletPubkey ?? "").trim();
  const txSig = String(input.txSig ?? "").trim();
  if (!epochId || !walletPubkey || !txSig) return { deleted: 0 };

  const pool = getPool();
  const res = await pool.query(
    `delete from public.hodlr_reward_claims
     where epoch_id=$1
       and wallet_pubkey=$2
       and status='pending'
       and tx_sig=$3`,
    [epochId, walletPubkey, txSig]
  );
  const deleted = res.rowCount ?? 0;
  return { deleted: Number.isFinite(deleted) ? Number(deleted) : 0 };
}

export async function insertHodlrRewardClaimPending(input: {
  epochId: string;
  walletPubkey: string;
  amountLamports: string;
  txSig: string;
  claimedAtUnix?: number;
}): Promise<{ ok: true; record: HodlrRewardClaimRecord } | { ok: false; error: string; existing?: HodlrRewardClaimRecord }> {
  await ensureHodlrSchema();
  if (!hasDatabase()) return { ok: false, error: "Database not available" };

  const epochId = String(input.epochId ?? "").trim();
  const walletPubkey = String(input.walletPubkey ?? "").trim();
  const amountLamports = String(input.amountLamports ?? "").trim();
  const txSig = String(input.txSig ?? "").trim();
  if (!epochId || !walletPubkey || !amountLamports || !txSig) {
    return { ok: false, error: "Invalid claim params" };
  }

  const now = nowUnix();
  const claimedAtUnix = Math.floor(Number(input.claimedAtUnix ?? now));
  const id = newId();

  const pool = getPool();
  const res = await pool.query(
    `insert into public.hodlr_reward_claims
       (id, epoch_id, wallet_pubkey, amount_lamports, tx_sig, status, claimed_at_unix, created_at_unix, updated_at_unix)
     values ($1,$2,$3,$4,$5,'pending',$6,$7,$7)
     on conflict (epoch_id, wallet_pubkey) do nothing
     returning *`,
    [id, epochId, walletPubkey, amountLamports, txSig, String(claimedAtUnix), String(now)]
  );

  const row = res.rows?.[0];
  if (row) return { ok: true, record: rowToHodlrRewardClaim(row) };

  const existing = await getHodlrRewardClaim({ epochId, walletPubkey });
  if (existing) {
    const msg = existing.status === "completed" ? "Already claimed" : "Claim pending";
    return { ok: false, error: msg, existing };
  }
  return { ok: false, error: "Claim conflict" };
}

export async function insertHodlrRewardClaimsPendingBatch(input: {
  walletPubkey: string;
  txSig: string;
  claimedAtUnix: number;
  rows: Array<{ epochId: string; amountLamports: string }>;
}): Promise<{ ok: true; inserted: number } | { ok: false; error: string }> {
  await ensureHodlrSchema();
  if (!hasDatabase()) return { ok: false, error: "Database not available" };

  const walletPubkey = String(input.walletPubkey ?? "").trim();
  const txSig = String(input.txSig ?? "").trim();
  const claimedAtUnix = Math.floor(Number(input.claimedAtUnix) || 0);
  const rows = Array.isArray(input.rows) ? input.rows : [];

  if (!walletPubkey || !txSig || claimedAtUnix <= 0 || !rows.length) {
    return { ok: false, error: "Invalid claim batch params" };
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");

    const now = nowUnix();

    let inserted = 0;
    for (const r of rows) {
      const epochId = String(r.epochId ?? "").trim();
      const amountLamports = String(r.amountLamports ?? "").trim();
      if (!epochId || !amountLamports) {
        await client.query("rollback");
        return { ok: false, error: "Invalid claim row" };
      }

      const id = newId();
      const res = await client.query(
        `insert into public.hodlr_reward_claims
           (id, epoch_id, wallet_pubkey, amount_lamports, tx_sig, status, claimed_at_unix, created_at_unix, updated_at_unix)
         values ($1,$2,$3,$4,$5,'pending',$6,$7,$7)
         on conflict (epoch_id, wallet_pubkey) do nothing
         returning epoch_id`,
        [id, epochId, walletPubkey, amountLamports, txSig, String(claimedAtUnix), String(now)]
      );

      if (!res.rows?.[0]) {
        await client.query("rollback");
        return { ok: false, error: "Claim conflict" };
      }
      inserted += 1;
    }

    await client.query("commit");
    return { ok: true, inserted };
  } catch (e) {
    try {
      await client.query("rollback");
    } catch {
    }
    throw e;
  } finally {
    client.release();
  }
}

export async function markHodlrRewardClaimCompleted(input: {
  epochId: string;
  walletPubkey: string;
  txSig: string;
}): Promise<{ updated: number }> {
  await ensureHodlrSchema();
  if (!hasDatabase()) throw new Error("Database not available");

  const epochId = String(input.epochId ?? "").trim();
  const walletPubkey = String(input.walletPubkey ?? "").trim();
  const txSig = String(input.txSig ?? "").trim();
  if (!epochId || !walletPubkey || !txSig) throw new Error("Invalid claim params");

  const t = nowUnix();
  const pool = getPool();
  const res = await pool.query(
    `update public.hodlr_reward_claims
     set status='completed', tx_sig=$3, updated_at_unix=$4
     where epoch_id=$1 and wallet_pubkey=$2 and status='pending'`,
    [epochId, walletPubkey, txSig, String(t)]
  );

  const updated = res.rowCount ?? 0;
  return { updated: Number.isFinite(updated) ? Number(updated) : 0 };
}

export async function insertHodlrPayoutDryRunIfAbsent(input: {
  epochId: string;
  sourcePubkey: string;
  sourceBalanceLamports: string;
  totalLamports: string;
  rows: Array<{ walletPubkey: string; amountLamports: string }>;
  createdAtUnix?: number;
}): Promise<{ skipped: boolean; inserted: number; record?: HodlrPayoutDryRunRecord }> {
  await ensureHodlrSchema();
  if (!hasDatabase()) throw new Error("Database not available");

  const epochId = String(input.epochId ?? "").trim();
  if (!epochId) throw new Error("epochId is required");

  const sourcePubkey = String(input.sourcePubkey ?? "").trim();
  const sourceBalanceLamports = String(input.sourceBalanceLamports ?? "").trim();
  const totalLamports = String(input.totalLamports ?? "").trim();
  if (!sourcePubkey || !sourceBalanceLamports || !totalLamports) throw new Error("Invalid payout dry run fields");

  const rows = Array.isArray(input.rows) ? input.rows : [];
  if (!rows.length) throw new Error("No payout rows");

  const pool = getPool();
  const existing = await pool.query(
    `select 1 from public.hodlr_payout_dry_runs where epoch_id=$1 limit 1`,
    [epochId]
  );
  if ((existing.rows ?? []).length) return { skipped: true, inserted: 0 };

  const createdAtUnix = Math.floor(Number(input.createdAtUnix ?? nowUnix()));

  const client = await pool.connect();
  try {
    await client.query("begin");
    const insertedHeader = await client.query(
      `insert into public.hodlr_payout_dry_runs (epoch_id, source_pubkey, source_balance_lamports, total_lamports, recipient_count, created_at_unix)
       values ($1,$2,$3,$4,$5,$6)
       on conflict (epoch_id) do nothing
       returning *`,
      [epochId, sourcePubkey, sourceBalanceLamports, totalLamports, rows.length, String(createdAtUnix)]
    );
    const headerRow = insertedHeader.rows?.[0];
    if (!headerRow) {
      await client.query("rollback");
      return { skipped: true, inserted: 0 };
    }

    let inserted = 0;
    for (const r of rows) {
      const walletPubkey = String(r.walletPubkey ?? "").trim();
      const amountLamports = String(r.amountLamports ?? "").trim();
      if (!walletPubkey || !amountLamports) continue;
      const res = await client.query(
        `insert into public.hodlr_payout_dry_run_items (epoch_id, wallet_pubkey, amount_lamports)
         values ($1,$2,$3)
         on conflict (epoch_id, wallet_pubkey) do nothing
         returning epoch_id`,
        [epochId, walletPubkey, amountLamports]
      );
      if (res.rows?.[0]) inserted += 1;
    }

    await client.query("commit");
    return { skipped: false, inserted, record: rowToPayoutDryRun(headerRow) };
  } catch (e) {
    try {
      await client.query("rollback");
    } catch {
    }
    throw e;
  } finally {
    client.release();
  }
}

export async function getHodlrBoardStats(): Promise<{
  totalEpochs: number;
  totalDistributedLamports: string;
  totalClaimants: number;
  latestEpoch: HodlrEpochRecord | null;
}> {
  await ensureHodlrSchema();
  if (!hasDatabase()) {
    return { totalEpochs: 0, totalDistributedLamports: "0", totalClaimants: 0, latestEpoch: null };
  }

  const pool = getPool();

  const epochsRes = await pool.query(`select count(*)::int as cnt from public.hodlr_epochs`);
  const totalEpochs = Number(epochsRes.rows?.[0]?.cnt ?? 0);

  const distRes = await pool.query(`select coalesce(sum(amount_lamports::numeric),0)::text as total from public.hodlr_distributions`);
  const totalDistributedLamports = String(distRes.rows?.[0]?.total ?? "0");

  const claimantsRes = await pool.query(`select count(distinct wallet_pubkey)::int as cnt from public.hodlr_reward_claims where status='completed'`);
  const totalClaimants = Number(claimantsRes.rows?.[0]?.cnt ?? 0);

  const latestRes = await pool.query(`select * from public.hodlr_epochs order by epoch_number desc limit 1`);
  const latestEpoch = latestRes.rows?.[0] ? rowToEpoch(latestRes.rows[0]) : null;

  return { totalEpochs, totalDistributedLamports, totalClaimants, latestEpoch };
}

export async function getHodlrTopEarners(limit = 10): Promise<Array<{ walletPubkey: string; totalLamports: string }>> {
  await ensureHodlrSchema();
  if (!hasDatabase()) return [];

  const pool = getPool();
  const res = await pool.query(
    `select wallet_pubkey, sum(amount_lamports::numeric)::text as total
     from public.hodlr_reward_claims
     where status='completed'
     group by wallet_pubkey
     order by sum(amount_lamports::numeric) desc
     limit $1`,
    [limit]
  );

  return (res.rows ?? []).map((r: any) => ({
    walletPubkey: String(r.wallet_pubkey ?? ""),
    totalLamports: String(r.total ?? "0"),
  }));
}

export async function getHodlrEpochStats(epochId: string): Promise<{
  totalPoolLamports: string;
  eligibleCount: number;
  claimedCount: number;
  claimedLamports: string;
} | null> {
  await ensureHodlrSchema();
  if (!hasDatabase()) return null;

  const id = String(epochId ?? "").trim();
  if (!id) return null;

  const pool = getPool();

  const distRes = await pool.query(
    `select coalesce(sum(amount_lamports::numeric),0)::text as total, count(*)::int as cnt
     from public.hodlr_distributions where epoch_id=$1`,
    [id]
  );
  const totalPoolLamports = String(distRes.rows?.[0]?.total ?? "0");
  const eligibleCount = Number(distRes.rows?.[0]?.cnt ?? 0);

  const claimRes = await pool.query(
    `select count(*)::int as cnt, coalesce(sum(amount_lamports::numeric),0)::text as total
     from public.hodlr_reward_claims where epoch_id=$1 and status='completed'`,
    [id]
  );
  const claimedCount = Number(claimRes.rows?.[0]?.cnt ?? 0);
  const claimedLamports = String(claimRes.rows?.[0]?.total ?? "0");

  return { totalPoolLamports, eligibleCount, claimedCount, claimedLamports };
}


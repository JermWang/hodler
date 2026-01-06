import crypto from "crypto";

import { getPool, hasDatabase } from "./db";

export type AsdStatus = "draft" | "active" | "paused" | "disabled";

export type AsdScheduleKind = "daily_percent";

export type AsdConfigRecord = {
  commitmentId: string;
  tokenMint: string;
  creatorPubkey: string;
  status: AsdStatus;
  scheduleKind: AsdScheduleKind;
  dailyPercentBps: number;
  slippageBps: number;
  maxDailyAmountRaw?: string | null;
  minIntervalSeconds: number;
  destinationPubkey: string;
  configHash: string;
  vaultWalletId?: string | null;
  vaultPubkey?: string | null;
  createdAtUnix: number;
  updatedAtUnix: number;
  activatedAtUnix?: number | null;
  lastExecutedAtUnix?: number | null;
  lastError?: string | null;
};

export type AsdExecutionStatus = "dry_run" | "sent" | "skipped" | "error";

export type AsdExecutionRecord = {
  id: string;
  commitmentId: string;
  tokenMint: string;
  runAtUnix: number;
  plannedAmountRaw: string;
  executedAmountRaw: string;
  status: AsdExecutionStatus;
  txSig?: string | null;
  vaultPubkey?: string | null;
  destinationPubkey: string;
  vaultBalanceRaw?: string | null;
  outMint?: string | null;
  outAmountRaw?: string | null;
  quoteJson?: string | null;
  error?: string | null;
};

const mem = {
  configs: new Map<string, AsdConfigRecord>(),
  executionsByCommitment: new Map<string, AsdExecutionRecord[]>(),
};

let ensuredSchema: Promise<void> | null = null;

function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

function newId(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function hashAsdConfigFields(fields: Record<string, unknown>): string {
  const h = crypto.createHash("sha256");
  h.update(JSON.stringify(fields));
  return h.digest("hex");
}

async function ensureSchema(): Promise<void> {
  if (!hasDatabase()) return;
  if (ensuredSchema) return ensuredSchema;

  ensuredSchema = (async () => {
    const pool = getPool();
    await pool.query(`
      create table if not exists asd_configs (
        commitment_id text primary key,
        token_mint text not null,
        creator_pubkey text not null,
        status text not null,
        schedule_kind text not null,
        daily_percent_bps integer not null,
        slippage_bps integer not null default 800,
        max_daily_amount_raw text null,
        min_interval_seconds integer not null,
        destination_pubkey text not null,
        config_hash text not null,
        vault_wallet_id text null,
        vault_pubkey text null,
        created_at_unix bigint not null,
        updated_at_unix bigint not null,
        activated_at_unix bigint null,
        last_executed_at_unix bigint null,
        last_error text null
      );
      create index if not exists asd_configs_status_idx on asd_configs(status);
      create index if not exists asd_configs_token_idx on asd_configs(token_mint);
      create index if not exists asd_configs_updated_idx on asd_configs(updated_at_unix);

      create table if not exists asd_executions (
        id text primary key,
        commitment_id text not null,
        token_mint text not null,
        run_at_unix bigint not null,
        planned_amount_raw text not null,
        executed_amount_raw text not null,
        status text not null,
        tx_sig text null,
        vault_pubkey text null,
        destination_pubkey text not null,
        vault_balance_raw text null,
        out_mint text null,
        out_amount_raw text null,
        quote_json text null,
        error text null
      );
      create index if not exists asd_executions_commitment_idx on asd_executions(commitment_id, run_at_unix);
      create index if not exists asd_executions_token_idx on asd_executions(token_mint, run_at_unix);

      alter table asd_configs add column if not exists slippage_bps integer not null default 800;
      alter table asd_executions add column if not exists out_mint text null;
      alter table asd_executions add column if not exists out_amount_raw text null;
      alter table asd_executions add column if not exists quote_json text null;
    `);
  })().catch((e) => {
    ensuredSchema = null;
    throw e;
  });

  return ensuredSchema;
}

function rowToConfig(row: any): AsdConfigRecord {
  return {
    commitmentId: String(row.commitment_id),
    tokenMint: String(row.token_mint),
    creatorPubkey: String(row.creator_pubkey),
    status: String(row.status) as AsdStatus,
    scheduleKind: String(row.schedule_kind) as AsdScheduleKind,
    dailyPercentBps: Number(row.daily_percent_bps),
    slippageBps: Number(row.slippage_bps ?? 800),
    maxDailyAmountRaw: row.max_daily_amount_raw == null ? null : String(row.max_daily_amount_raw),
    minIntervalSeconds: Number(row.min_interval_seconds),
    destinationPubkey: String(row.destination_pubkey),
    configHash: String(row.config_hash),
    vaultWalletId: row.vault_wallet_id == null ? null : String(row.vault_wallet_id),
    vaultPubkey: row.vault_pubkey == null ? null : String(row.vault_pubkey),
    createdAtUnix: Number(row.created_at_unix),
    updatedAtUnix: Number(row.updated_at_unix),
    activatedAtUnix: row.activated_at_unix == null ? null : Number(row.activated_at_unix),
    lastExecutedAtUnix: row.last_executed_at_unix == null ? null : Number(row.last_executed_at_unix),
    lastError: row.last_error == null ? null : String(row.last_error),
  };
}

function rowToExecution(row: any): AsdExecutionRecord {
  return {
    id: String(row.id),
    commitmentId: String(row.commitment_id),
    tokenMint: String(row.token_mint),
    runAtUnix: Number(row.run_at_unix),
    plannedAmountRaw: String(row.planned_amount_raw),
    executedAmountRaw: String(row.executed_amount_raw),
    status: String(row.status) as AsdExecutionStatus,
    txSig: row.tx_sig == null ? null : String(row.tx_sig),
    vaultPubkey: row.vault_pubkey == null ? null : String(row.vault_pubkey),
    destinationPubkey: String(row.destination_pubkey),
    vaultBalanceRaw: row.vault_balance_raw == null ? null : String(row.vault_balance_raw),
    outMint: row.out_mint == null ? null : String(row.out_mint),
    outAmountRaw: row.out_amount_raw == null ? null : String(row.out_amount_raw),
    quoteJson: row.quote_json == null ? null : String(row.quote_json),
    error: row.error == null ? null : String(row.error),
  };
}

export async function getAsdConfig(commitmentId: string): Promise<AsdConfigRecord | null> {
  await ensureSchema();

  const id = String(commitmentId ?? "").trim();
  if (!id) return null;

  if (!hasDatabase()) {
    return mem.configs.get(id) ?? null;
  }

  const pool = getPool();
  const res = await pool.query("select * from asd_configs where commitment_id=$1", [id]);
  const row = res.rows[0];
  return row ? rowToConfig(row) : null;
}

function normalizeDailyPercentBps(n: number): number {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v) || v <= 0 || v > 10_000) {
    throw new Error("dailyPercentBps must be between 1 and 10000");
  }
  return v;
}

function normalizeSlippageBps(n: number | undefined): number {
  const v = n == null ? 800 : Math.floor(Number(n));
  if (!Number.isFinite(v) || v < 1 || v > 1000) {
    throw new Error("slippageBps must be between 1 and 1000");
  }
  return v;
}

function normalizeMinIntervalSeconds(n: number | undefined): number {
  const v = n == null ? 20 * 60 * 60 : Math.floor(Number(n));
  if (!Number.isFinite(v) || v < 60 || v > 14 * 24 * 60 * 60) {
    throw new Error("minIntervalSeconds must be between 60 and 1209600");
  }
  return v;
}

function normalizeMaxDailyAmountRaw(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  try {
    const b = BigInt(s);
    if (b <= 0n) return null;
    return b.toString();
  } catch {
    throw new Error("Invalid maxDailyAmountRaw");
  }
}

export function computeConfigHash(input: {
  commitmentId: string;
  tokenMint: string;
  creatorPubkey: string;
  destinationPubkey: string;
  scheduleKind: AsdScheduleKind;
  dailyPercentBps: number;
  slippageBps: number;
  maxDailyAmountRaw: string | null;
  minIntervalSeconds: number;
}): string {
  return hashAsdConfigFields({
    commitmentId: input.commitmentId,
    tokenMint: input.tokenMint,
    creatorPubkey: input.creatorPubkey,
    destinationPubkey: input.destinationPubkey,
    scheduleKind: input.scheduleKind,
    dailyPercentBps: input.dailyPercentBps,
    slippageBps: input.slippageBps,
    maxDailyAmountRaw: input.maxDailyAmountRaw,
    minIntervalSeconds: input.minIntervalSeconds,
  });
}

export async function upsertAsdDraftConfig(input: {
  commitmentId: string;
  tokenMint: string;
  creatorPubkey: string;
  destinationPubkey: string;
  dailyPercentBps: number;
  slippageBps?: number;
  maxDailyAmountRaw?: string | null;
  minIntervalSeconds?: number;
}): Promise<AsdConfigRecord> {
  await ensureSchema();

  const commitmentId = String(input.commitmentId ?? "").trim();
  const tokenMint = String(input.tokenMint ?? "").trim();
  const creatorPubkey = String(input.creatorPubkey ?? "").trim();
  const destinationPubkey = String(input.destinationPubkey ?? "").trim();

  if (!commitmentId) throw new Error("commitmentId is required");
  if (!tokenMint) throw new Error("tokenMint is required");
  if (!creatorPubkey) throw new Error("creatorPubkey is required");
  if (!destinationPubkey) throw new Error("destinationPubkey is required");

  const scheduleKind: AsdScheduleKind = "daily_percent";
  const dailyPercentBps = normalizeDailyPercentBps(input.dailyPercentBps);
  const slippageBps = normalizeSlippageBps(input.slippageBps);
  const maxDailyAmountRaw = normalizeMaxDailyAmountRaw(input.maxDailyAmountRaw ?? null);
  const minIntervalSeconds = normalizeMinIntervalSeconds(input.minIntervalSeconds);

  const t = nowUnix();

  const configHash = computeConfigHash({
    commitmentId,
    tokenMint,
    creatorPubkey,
    destinationPubkey,
    scheduleKind,
    dailyPercentBps,
    slippageBps,
    maxDailyAmountRaw,
    minIntervalSeconds,
  });

  if (!hasDatabase()) {
    const prev = mem.configs.get(commitmentId);
    if (prev && prev.activatedAtUnix) {
      throw new Error("ASD is already activated and cannot be modified");
    }

    const rec: AsdConfigRecord = {
      commitmentId,
      tokenMint,
      creatorPubkey,
      status: prev?.status ?? "draft",
      scheduleKind,
      dailyPercentBps,
      slippageBps,
      maxDailyAmountRaw,
      minIntervalSeconds,
      destinationPubkey,
      configHash,
      vaultWalletId: prev?.vaultWalletId ?? null,
      vaultPubkey: prev?.vaultPubkey ?? null,
      createdAtUnix: prev?.createdAtUnix ?? t,
      updatedAtUnix: t,
      activatedAtUnix: prev?.activatedAtUnix ?? null,
      lastExecutedAtUnix: prev?.lastExecutedAtUnix ?? null,
      lastError: prev?.lastError ?? null,
    };

    mem.configs.set(commitmentId, rec);
    return rec;
  }

  const existing = await getAsdConfig(commitmentId);
  if (existing?.activatedAtUnix) {
    throw new Error("ASD is already activated and cannot be modified");
  }

  const pool = getPool();
  const res = await pool.query(
    `insert into asd_configs (
      commitment_id, token_mint, creator_pubkey, status, schedule_kind, daily_percent_bps, slippage_bps,
      max_daily_amount_raw, min_interval_seconds, destination_pubkey, config_hash,
      vault_wallet_id, vault_pubkey,
      created_at_unix, updated_at_unix, activated_at_unix, last_executed_at_unix, last_error
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,null,null,$12,$13,null,null,null)
    on conflict (commitment_id) do update set
      token_mint=excluded.token_mint,
      creator_pubkey=excluded.creator_pubkey,
      status=case when asd_configs.status='disabled' then 'disabled' else asd_configs.status end,
      schedule_kind=excluded.schedule_kind,
      daily_percent_bps=excluded.daily_percent_bps,
      slippage_bps=excluded.slippage_bps,
      max_daily_amount_raw=excluded.max_daily_amount_raw,
      min_interval_seconds=excluded.min_interval_seconds,
      destination_pubkey=excluded.destination_pubkey,
      config_hash=excluded.config_hash,
      updated_at_unix=excluded.updated_at_unix
    returning *`,
    [
      commitmentId,
      tokenMint,
      creatorPubkey,
      existing?.status ?? "draft",
      scheduleKind,
      dailyPercentBps,
      slippageBps,
      maxDailyAmountRaw,
      minIntervalSeconds,
      destinationPubkey,
      configHash,
      String(existing?.createdAtUnix ?? t),
      String(t),
    ]
  );

  const row = res.rows[0];
  if (!row) throw new Error("Failed to upsert ASD config");
  return rowToConfig(row);
}

export async function activateAsdConfig(input: {
  commitmentId: string;
  vaultWalletId: string;
  vaultPubkey: string;
}): Promise<AsdConfigRecord> {
  await ensureSchema();

  const commitmentId = String(input.commitmentId ?? "").trim();
  const vaultWalletId = String(input.vaultWalletId ?? "").trim();
  const vaultPubkey = String(input.vaultPubkey ?? "").trim();

  if (!commitmentId) throw new Error("commitmentId is required");
  if (!vaultWalletId) throw new Error("vaultWalletId is required");
  if (!vaultPubkey) throw new Error("vaultPubkey is required");

  const existing = await getAsdConfig(commitmentId);
  if (!existing) throw new Error("ASD config not found");
  if (existing.activatedAtUnix) return existing;

  const t = nowUnix();

  if (!hasDatabase()) {
    const next: AsdConfigRecord = {
      ...existing,
      status: existing.status === "disabled" ? "disabled" : "active",
      vaultWalletId,
      vaultPubkey,
      activatedAtUnix: t,
      updatedAtUnix: t,
    };
    mem.configs.set(commitmentId, next);
    return next;
  }

  const pool = getPool();
  const res = await pool.query(
    `update asd_configs set
      status=case when status='disabled' then 'disabled' else 'active' end,
      vault_wallet_id=$2,
      vault_pubkey=$3,
      activated_at_unix=$4,
      updated_at_unix=$4
    where commitment_id=$1 and activated_at_unix is null
    returning *`,
    [commitmentId, vaultWalletId, vaultPubkey, String(t)]
  );

  const row = res.rows[0];
  if (row) return rowToConfig(row);

  const again = await getAsdConfig(commitmentId);
  if (!again) throw new Error("ASD config not found");
  return again;
}

export async function setAsdStatus(input: {
  commitmentId: string;
  status: AsdStatus;
}): Promise<AsdConfigRecord> {
  await ensureSchema();

  const commitmentId = String(input.commitmentId ?? "").trim();
  const status = String(input.status ?? "").trim() as AsdStatus;

  if (!commitmentId) throw new Error("commitmentId is required");
  if (status !== "draft" && status !== "active" && status !== "paused" && status !== "disabled") {
    throw new Error("Invalid status");
  }

  const existing = await getAsdConfig(commitmentId);
  if (!existing) throw new Error("ASD config not found");

  const t = nowUnix();

  if (!hasDatabase()) {
    const next: AsdConfigRecord = { ...existing, status, updatedAtUnix: t };
    mem.configs.set(commitmentId, next);
    return next;
  }

  const pool = getPool();
  const res = await pool.query(
    "update asd_configs set status=$2, updated_at_unix=$3 where commitment_id=$1 returning *",
    [commitmentId, status, String(t)]
  );
  const row = res.rows[0];
  if (!row) throw new Error("ASD config not found");
  return rowToConfig(row);
}

export async function listActiveAsdConfigs(input: { limit: number }): Promise<AsdConfigRecord[]> {
  await ensureSchema();

  const limit = Math.max(1, Math.min(500, Math.floor(Number(input.limit ?? 200))));

  if (!hasDatabase()) {
    const out: AsdConfigRecord[] = [];
    for (const c of mem.configs.values()) {
      if (c.status === "active" && c.activatedAtUnix) out.push(c);
    }
    out.sort((a, b) => (a.updatedAtUnix || 0) - (b.updatedAtUnix || 0));
    return out.slice(0, limit);
  }

  const pool = getPool();
  const res = await pool.query(
    "select * from asd_configs where status='active' and activated_at_unix is not null order by updated_at_unix asc limit $1",
    [limit]
  );
  return res.rows.map(rowToConfig);
}

export async function insertAsdExecution(input: Omit<AsdExecutionRecord, "id">): Promise<AsdExecutionRecord> {
  await ensureSchema();

  const rec: AsdExecutionRecord = { ...input, id: newId() };

  if (!hasDatabase()) {
    const prev = mem.executionsByCommitment.get(rec.commitmentId) ?? [];
    mem.executionsByCommitment.set(rec.commitmentId, prev.concat([rec]).slice(-500));
    return rec;
  }

  const pool = getPool();
  const res = await pool.query(
    `insert into asd_executions (
      id, commitment_id, token_mint, run_at_unix, planned_amount_raw, executed_amount_raw,
      status, tx_sig, vault_pubkey, destination_pubkey, vault_balance_raw, out_mint, out_amount_raw, quote_json, error
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
    returning *`,
    [
      rec.id,
      rec.commitmentId,
      rec.tokenMint,
      String(rec.runAtUnix),
      rec.plannedAmountRaw,
      rec.executedAmountRaw,
      rec.status,
      rec.txSig ?? null,
      rec.vaultPubkey ?? null,
      rec.destinationPubkey,
      rec.vaultBalanceRaw ?? null,
      rec.outMint ?? null,
      rec.outAmountRaw ?? null,
      rec.quoteJson ?? null,
      rec.error ?? null,
    ]
  );
  const row = res.rows[0];
  if (!row) throw new Error("Failed to insert ASD execution");
  return rowToExecution(row);
}

export async function listAsdExecutions(input: { commitmentId: string; limit: number }): Promise<AsdExecutionRecord[]> {
  await ensureSchema();

  const commitmentId = String(input.commitmentId ?? "").trim();
  const limit = Math.max(1, Math.min(200, Math.floor(Number(input.limit ?? 50))));

  if (!commitmentId) return [];

  if (!hasDatabase()) {
    const prev = mem.executionsByCommitment.get(commitmentId) ?? [];
    return prev.slice().sort((a, b) => b.runAtUnix - a.runAtUnix).slice(0, limit);
  }

  const pool = getPool();
  const res = await pool.query(
    "select * from asd_executions where commitment_id=$1 order by run_at_unix desc limit $2",
    [commitmentId, limit]
  );
  return res.rows.map(rowToExecution);
}

export async function updateAsdAfterExecution(input: {
  commitmentId: string;
  executedAtUnix: number;
  lastError?: string | null;
}): Promise<void> {
  await ensureSchema();

  const commitmentId = String(input.commitmentId ?? "").trim();
  const executedAtUnix = Math.floor(Number(input.executedAtUnix ?? 0));
  const lastError = input.lastError == null ? null : String(input.lastError);

  if (!commitmentId || !Number.isFinite(executedAtUnix) || executedAtUnix <= 0) return;

  if (!hasDatabase()) {
    const existing = mem.configs.get(commitmentId);
    if (!existing) return;
    mem.configs.set(commitmentId, { ...existing, lastExecutedAtUnix: executedAtUnix, lastError, updatedAtUnix: nowUnix() });
    return;
  }

  const pool = getPool();
  await pool.query(
    "update asd_configs set last_executed_at_unix=$2, last_error=$3, updated_at_unix=$4 where commitment_id=$1",
    [commitmentId, String(executedAtUnix), lastError, String(nowUnix())]
  );
}

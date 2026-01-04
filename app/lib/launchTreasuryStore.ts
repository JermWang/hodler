import { hasDatabase, getPool } from "./db";
import { privyCreateSolanaWallet } from "./privy";

export type LaunchTreasuryWalletRecord = {
  payerWallet: string;
  walletId: string;
  treasuryWallet: string;
  createdAtUnix: number;
  updatedAtUnix: number;
};

const mem = {
  byPayer: new Map<string, LaunchTreasuryWalletRecord>(),
};

let ensuredSchema: Promise<void> | null = null;

function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

async function ensureSchema(): Promise<void> {
  if (!hasDatabase()) return;
  if (ensuredSchema) return ensuredSchema;

  ensuredSchema = (async () => {
    const pool = getPool();
    await pool.query(`
      create table if not exists public.launch_treasury_wallets (
        payer_wallet text primary key,
        wallet_id text not null,
        treasury_wallet text not null,
        created_at_unix bigint not null,
        updated_at_unix bigint not null
      );
      create index if not exists launch_treasury_wallets_updated_idx on public.launch_treasury_wallets(updated_at_unix);
    `);
  })().catch((e) => {
    ensuredSchema = null;
    throw e;
  });

  return ensuredSchema;
}

function rowToRecord(row: any): LaunchTreasuryWalletRecord {
  return {
    payerWallet: String(row.payer_wallet),
    walletId: String(row.wallet_id),
    treasuryWallet: String(row.treasury_wallet),
    createdAtUnix: Number(row.created_at_unix),
    updatedAtUnix: Number(row.updated_at_unix),
  };
}

export async function getLaunchTreasuryWallet(payerWallet: string): Promise<LaunchTreasuryWalletRecord | null> {
  await ensureSchema();

  const key = String(payerWallet ?? "").trim();
  if (!key) return null;

  if (!hasDatabase()) {
    return mem.byPayer.get(key) ?? null;
  }

  const pool = getPool();
  const res = await pool.query("select * from public.launch_treasury_wallets where payer_wallet=$1", [key]);
  const row = res.rows[0];
  return row ? rowToRecord(row) : null;
}

export async function getOrCreateLaunchTreasuryWallet(input: {
  payerWallet: string;
}): Promise<{ record: LaunchTreasuryWalletRecord; created: boolean }> {
  await ensureSchema();

  const payerWallet = String(input.payerWallet ?? "").trim();
  if (!payerWallet) throw new Error("payerWallet is required");

  const existing = await getLaunchTreasuryWallet(payerWallet);
  if (existing) return { record: existing, created: false };

  const { walletId, address } = await privyCreateSolanaWallet();
  const ts = nowUnix();

  const rec: LaunchTreasuryWalletRecord = {
    payerWallet,
    walletId,
    treasuryWallet: address,
    createdAtUnix: ts,
    updatedAtUnix: ts,
  };

  if (!hasDatabase()) {
    mem.byPayer.set(payerWallet, rec);
    return { record: rec, created: true };
  }

  const pool = getPool();
  try {
    await pool.query(
      "insert into public.launch_treasury_wallets (payer_wallet, wallet_id, treasury_wallet, created_at_unix, updated_at_unix) values ($1,$2,$3,$4,$5)",
      [payerWallet, walletId, address, String(ts), String(ts)]
    );
    return { record: rec, created: true };
  } catch {
    const after = await getLaunchTreasuryWallet(payerWallet);
    if (after) return { record: after, created: false };
    throw new Error("Failed to create or load treasury wallet");
  }
}

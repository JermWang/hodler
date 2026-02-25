import { getPool, hasDatabase } from "./db";

type LockRow = {
  creatorPubkey: string;
  createdAtUnix: number;
  txSig?: string | null;
};

const mem = {
  locks: new Map<string, LockRow>(),
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
      create table if not exists pumpfun_creator_fee_claim_locks (
        creator_pubkey text primary key,
        created_at_unix bigint not null,
        tx_sig text null
      );
    `);
  })().catch((e) => {
    ensuredSchema = null;
    throw e;
  });

  return ensuredSchema;
}

export async function tryAcquirePumpfunCreatorFeeClaimLock(input: {
  creatorPubkey: string;
  maxAgeSeconds: number;
}): Promise<{ acquired: true } | { acquired: false; existing: LockRow }> {
  await ensureSchema();

  const createdAtUnix = nowUnix();
  const maxAgeSeconds = Math.max(10, Math.min(10 * 60, input.maxAgeSeconds));

  if (!hasDatabase()) {
    const existing = mem.locks.get(input.creatorPubkey);
    if (!existing) {
      mem.locks.set(input.creatorPubkey, { creatorPubkey: input.creatorPubkey, createdAtUnix, txSig: null });
      return { acquired: true };
    }
    if (createdAtUnix - existing.createdAtUnix > maxAgeSeconds) {
      mem.locks.set(input.creatorPubkey, { creatorPubkey: input.creatorPubkey, createdAtUnix, txSig: null });
      return { acquired: true };
    }
    return { acquired: false, existing };
  }

  const pool = getPool();

  const res = await pool.query(
    `insert into pumpfun_creator_fee_claim_locks (creator_pubkey, created_at_unix, tx_sig)
     values ($1,$2,null)
     on conflict (creator_pubkey) do nothing
     returning creator_pubkey`,
    [input.creatorPubkey, String(createdAtUnix)]
  );

  if (res.rows[0]) return { acquired: true };

  const existingRes = await pool.query(
    "select creator_pubkey, created_at_unix, tx_sig from pumpfun_creator_fee_claim_locks where creator_pubkey=$1",
    [input.creatorPubkey]
  );

  const row = existingRes.rows[0];
  const existing: LockRow = {
    creatorPubkey: input.creatorPubkey,
    createdAtUnix: row ? Number(row.created_at_unix) : createdAtUnix,
    txSig: row ? (row.tx_sig ?? null) : null,
  };

  if (createdAtUnix - existing.createdAtUnix > maxAgeSeconds) {
    const takeOver = await pool.query(
      "update pumpfun_creator_fee_claim_locks set created_at_unix=$2, tx_sig=null where creator_pubkey=$1 returning creator_pubkey",
      [input.creatorPubkey, String(createdAtUnix)]
    );
    if (takeOver.rows[0]) return { acquired: true };
  }

  return { acquired: false, existing };
}

export async function releasePumpfunCreatorFeeClaimLock(input: { creatorPubkey: string }): Promise<void> {
  await ensureSchema();

  if (!hasDatabase()) {
    mem.locks.delete(input.creatorPubkey);
    return;
  }

  const pool = getPool();
  await pool.query("delete from pumpfun_creator_fee_claim_locks where creator_pubkey=$1", [input.creatorPubkey]);
}

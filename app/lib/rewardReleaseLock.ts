import { getPool, hasDatabase } from "./db";

type LockRow = {
  commitmentId: string;
  milestoneId: string;
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

function key(commitmentId: string, milestoneId: string): string {
  return `${commitmentId}:${milestoneId}`;
}

async function ensureSchema(): Promise<void> {
  if (!hasDatabase()) return;
  if (ensuredSchema) return ensuredSchema;

  ensuredSchema = (async () => {
    const pool = getPool();
    await pool.query(`
      create table if not exists reward_release_locks (
        commitment_id text not null,
        milestone_id text not null,
        created_at_unix bigint not null,
        tx_sig text null,
        primary key (commitment_id, milestone_id)
      );
    `);
  })().catch((e) => {
    ensuredSchema = null;
    throw e;
  });

  return ensuredSchema;
}

export async function tryAcquireRewardReleaseLock(input: {
  commitmentId: string;
  milestoneId: string;
}): Promise<{ acquired: true } | { acquired: false; existing: LockRow }> {
  await ensureSchema();

  const createdAtUnix = nowUnix();

  if (!hasDatabase()) {
    const k = key(input.commitmentId, input.milestoneId);
    const existing = mem.locks.get(k);
    if (existing) return { acquired: false, existing };
    mem.locks.set(k, { commitmentId: input.commitmentId, milestoneId: input.milestoneId, createdAtUnix, txSig: null });
    return { acquired: true };
  }

  const pool = getPool();
  const res = await pool.query(
    `insert into reward_release_locks (commitment_id, milestone_id, created_at_unix, tx_sig)
     values ($1,$2,$3,null)
     on conflict (commitment_id, milestone_id) do nothing
     returning commitment_id`,
    [input.commitmentId, input.milestoneId, String(createdAtUnix)]
  );

  if (res.rows[0]) return { acquired: true };

  const existingRes = await pool.query(
    "select commitment_id, milestone_id, created_at_unix, tx_sig from reward_release_locks where commitment_id=$1 and milestone_id=$2",
    [input.commitmentId, input.milestoneId]
  );
  const row = existingRes.rows[0];
  const existing: LockRow = {
    commitmentId: input.commitmentId,
    milestoneId: input.milestoneId,
    createdAtUnix: row ? Number(row.created_at_unix) : createdAtUnix,
    txSig: row ? (row.tx_sig ?? null) : null,
  };
  return { acquired: false, existing };
}

export async function releaseRewardReleaseLock(input: { commitmentId: string; milestoneId: string }): Promise<void> {
  await ensureSchema();

  if (!hasDatabase()) {
    mem.locks.delete(key(input.commitmentId, input.milestoneId));
    return;
  }

  const pool = getPool();
  await pool.query("delete from reward_release_locks where commitment_id=$1 and milestone_id=$2", [input.commitmentId, input.milestoneId]);
}

export async function setRewardReleaseLockTxSig(input: {
  commitmentId: string;
  milestoneId: string;
  txSig: string;
}): Promise<void> {
  await ensureSchema();

  if (!hasDatabase()) {
    const k = key(input.commitmentId, input.milestoneId);
    const existing = mem.locks.get(k);
    if (existing) mem.locks.set(k, { ...existing, txSig: input.txSig });
    return;
  }

  const pool = getPool();
  await pool.query(
    "update reward_release_locks set tx_sig=$3 where commitment_id=$1 and milestone_id=$2",
    [input.commitmentId, input.milestoneId, input.txSig]
  );
}

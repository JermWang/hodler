import { getPool, hasDatabase } from "./db";

export type MarketCapMilestoneConfirmation = {
  commitmentId: string;
  milestoneId: string;
  tokenMint: string;
  confirmedAtUnix: number;
  totalFundedLamports: number;
  unlockLamports: number;
  thresholdUsd: number;
  chainId: string;
  pairAddress: string;
  dexId: string;
  evidenceJson: string;
};

const mem = {
  confirmationsByKey: new Map<string, MarketCapMilestoneConfirmation>(),
};

let ensuredSchema: Promise<void> | null = null;

function key(input: { commitmentId: string; milestoneId: string }): string {
  return `${input.commitmentId}:${input.milestoneId}`;
}

async function ensureSchema(): Promise<void> {
  if (!hasDatabase()) return;
  if (ensuredSchema) return ensuredSchema;

  ensuredSchema = (async () => {
    const pool = getPool();
    await pool.query(`
      create table if not exists marketcap_milestone_confirmations (
        commitment_id text not null,
        milestone_id text not null,
        token_mint text not null,
        confirmed_at_unix bigint not null,
        total_funded_lamports bigint not null,
        unlock_lamports bigint not null,
        threshold_usd double precision not null,
        chain_id text not null,
        pair_address text not null,
        dex_id text not null,
        evidence_json text not null,
        primary key (commitment_id, milestone_id)
      );
      create index if not exists marketcap_milestone_confirmations_token_idx on marketcap_milestone_confirmations(token_mint, confirmed_at_unix);
    `);
  })().catch((e) => {
    ensuredSchema = null;
    throw e;
  });

  return ensuredSchema;
}

export async function getMarketCapMilestoneConfirmation(input: {
  commitmentId: string;
  milestoneId: string;
}): Promise<MarketCapMilestoneConfirmation | null> {
  await ensureSchema();

  const commitmentId = String(input.commitmentId ?? "").trim();
  const milestoneId = String(input.milestoneId ?? "").trim();
  if (!commitmentId || !milestoneId) return null;

  if (!hasDatabase()) {
    return mem.confirmationsByKey.get(key({ commitmentId, milestoneId })) ?? null;
  }

  const pool = getPool();
  const res = await pool.query(
    `select commitment_id, milestone_id, token_mint, confirmed_at_unix, total_funded_lamports, unlock_lamports,
            threshold_usd, chain_id, pair_address, dex_id, evidence_json
     from marketcap_milestone_confirmations where commitment_id=$1 and milestone_id=$2`,
    [commitmentId, milestoneId]
  );
  const row = res.rows[0];
  if (!row) return null;
  return {
    commitmentId: String(row.commitment_id),
    milestoneId: String(row.milestone_id),
    tokenMint: String(row.token_mint),
    confirmedAtUnix: Number(row.confirmed_at_unix),
    totalFundedLamports: Number(row.total_funded_lamports),
    unlockLamports: Number(row.unlock_lamports),
    thresholdUsd: Number(row.threshold_usd),
    chainId: String(row.chain_id),
    pairAddress: String(row.pair_address),
    dexId: String(row.dex_id),
    evidenceJson: String(row.evidence_json),
  };
}

export async function tryAcquireMarketCapMilestoneConfirmation(input: {
  confirmation: MarketCapMilestoneConfirmation;
}): Promise<{ acquired: true } | { acquired: false; existing: MarketCapMilestoneConfirmation }> {
  await ensureSchema();

  const c = input.confirmation;
  const commitmentId = String(c.commitmentId ?? "").trim();
  const milestoneId = String(c.milestoneId ?? "").trim();

  if (!commitmentId || !milestoneId) throw new Error("Invalid confirmation key");

  if (!hasDatabase()) {
    const k = key({ commitmentId, milestoneId });
    const existing = mem.confirmationsByKey.get(k);
    if (existing) return { acquired: false, existing };
    mem.confirmationsByKey.set(k, c);
    return { acquired: true };
  }

  const pool = getPool();
  const res = await pool.query(
    `insert into marketcap_milestone_confirmations (
      commitment_id, milestone_id, token_mint, confirmed_at_unix, total_funded_lamports, unlock_lamports,
      threshold_usd, chain_id, pair_address, dex_id, evidence_json
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    on conflict (commitment_id, milestone_id) do nothing
    returning commitment_id`,
    [
      commitmentId,
      milestoneId,
      c.tokenMint,
      String(c.confirmedAtUnix),
      String(c.totalFundedLamports),
      String(c.unlockLamports),
      c.thresholdUsd,
      c.chainId,
      c.pairAddress,
      c.dexId,
      c.evidenceJson,
    ]
  );

  if (res.rows[0]) return { acquired: true };

  const existing = await getMarketCapMilestoneConfirmation({ commitmentId, milestoneId });
  if (!existing) throw new Error("Failed to acquire market cap milestone confirmation");
  return { acquired: false, existing };
}

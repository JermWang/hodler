import crypto from "crypto";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { Keypair } from "@solana/web3.js";

import { getPool, hasDatabase } from "./db";

export type CommitmentKind = "personal" | "creator_reward";

export type CreatorFeeMode = "managed" | "assisted";

export type CommitmentStatus =
  | "created"
  | "resolving"
  | "resolved_success"
  | "resolved_failure"
  | "active"
  | "completed"
  | "failed";

export type RewardMilestoneStatus = "locked" | "claimable" | "released";

export type RewardMilestone = {
  id: string;
  title: string;
  unlockLamports: number;
  status: RewardMilestoneStatus;
  completedAtUnix?: number;
  claimableAtUnix?: number;
  becameClaimableAtUnix?: number;
  releasedAtUnix?: number;
  releasedTxSig?: string;
};

export type CommitmentRecord = {
  id: string;
  statement?: string;
  authority: string;
  destinationOnFail: string;
  amountLamports: number;
  deadlineUnix: number;
  escrowPubkey: string;
  escrowSecretKey: string;
  kind: CommitmentKind;
  creatorPubkey?: string;
  creatorFeeMode?: CreatorFeeMode;
  tokenMint?: string;
  totalFundedLamports: number;
  unlockedLamports: number;
  milestones?: RewardMilestone[];
  status: CommitmentStatus;
  createdAtUnix: number;
  resolvedAtUnix?: number;
  resolvedTxSig?: string;
};

export type RewardMilestoneApprovalCounts = Record<string, number>;

type InMemoryRewardSignals = Map<string, Map<string, Set<string>>>;

export type RewardVoterSnapshot = {
  commitmentId: string;
  milestoneId: string;
  signerPubkey: string;
  createdAtUnix: number;
  projectMint: string;
  projectUiAmount: number;
  shipUiAmount: number;
  shipMultiplierBps: number;
};

export type FailureDistributionStatus = "open" | "completed";

export type FailureDistributionRecord = {
  id: string;
  commitmentId: string;
  createdAtUnix: number;
  buybackLamports: number;
  voterPotLamports: number;
  shipBuybackTreasuryPubkey: string;
  buybackTxSig: string;
  voterPotTxSig?: string;
  status: FailureDistributionStatus;
};

export type FailureDistributionAllocation = {
  distributionId: string;
  walletPubkey: string;
  amountLamports: number;
  weight: number;
};

export type FailureDistributionClaim = {
  distributionId: string;
  walletPubkey: string;
  claimedAtUnix: number;
  amountLamports: number;
  txSig: string;
};

const mem = {
  commitments: new Map<string, CommitmentRecord>(),
  rewardSignals: new Map<string, Map<string, Set<string>>>() as InMemoryRewardSignals,
  rewardVoterSnapshots: new Map<string, Map<string, Map<string, RewardVoterSnapshot>>>(),
  failureDistributionsByCommitmentId: new Map<string, FailureDistributionRecord>(),
  failureAllocationsByDistributionId: new Map<string, Map<string, FailureDistributionAllocation>>(),
  failureClaimsByDistributionId: new Map<string, Map<string, FailureDistributionClaim>>(),
};

function ensureMockSeeded(): void {
  if (hasDatabase()) return;
  if (mem.commitments.size > 0) return;

  const now = nowUnix();

  const seededBytes = (label: string, length: number) => {
    const out = new Uint8Array(length);
    let offset = 0;
    let i = 0;
    while (offset < length) {
      const h = crypto.createHash("sha256");
      h.update(`cts_mock:${label}:${i++}`, "utf8");
      const chunk = new Uint8Array(h.digest());
      const take = Math.min(chunk.length, length - offset);
      out.set(chunk.slice(0, take), offset);
      offset += take;
    }
    return out;
  };

  const makeId = (label: string) => {
    const h = crypto.createHash("sha256");
    h.update(`cts_mock_id:${label}`, "utf8");
    return h.digest("hex").slice(0, 32);
  };

  const makeKeypair = (label: string) => {
    const seed = seededBytes(`kp:${label}`, 32);
    return Keypair.fromSeed(seed);
  };

  const makeSig = (label: string) => bs58.encode(seededBytes(`sig:${label}`, 64));

  const makeCommitmentKeypair = (label: string) => {
    const escrow = makeKeypair(`escrow:${label}`);
    return {
      escrowPubkey: escrow.publicKey.toBase58(),
      escrowSecretKeyB58: bs58.encode(escrow.secretKey),
    };
  };

  const makeWallet = (label: string) => makeKeypair(`wallet:${label}`).publicKey.toBase58();

  const personal1 = (() => {
    const { escrowPubkey, escrowSecretKeyB58 } = makeCommitmentKeypair("personal1");
    const authority = makeWallet("personal1:authority");
    const destinationOnFail = makeWallet("personal1:destinationOnFail");
    const id = makeId("personal1");
    const createdAtUnix = now - 36 * 60 * 60;
    return {
      ...createCommitmentRecord({
        id,
        statement: "Ship v1 onboarding + landing polish",
        authority,
        destinationOnFail,
        amountLamports: Math.floor(0.5 * 1_000_000_000),
        deadlineUnix: now + 3 * 24 * 60 * 60,
        escrowPubkey,
        escrowSecretKeyB58,
      }),
      createdAtUnix,
      status: "created" as const,
    } satisfies CommitmentRecord;
  })();

  const personal2 = (() => {
    const { escrowPubkey, escrowSecretKeyB58 } = makeCommitmentKeypair("personal2");
    const authority = makeWallet("personal2:authority");
    const destinationOnFail = makeWallet("personal2:destinationOnFail");
    const id = makeId("personal2");
    const createdAtUnix = now - 6 * 24 * 60 * 60;
    const resolvedAtUnix = now - 4 * 60 * 60;
    return {
      ...createCommitmentRecord({
        id,
        statement: "Publish audit report + fix P0 bugs",
        authority,
        destinationOnFail,
        amountLamports: Math.floor(1.25 * 1_000_000_000),
        deadlineUnix: now + 24 * 60 * 60,
        escrowPubkey,
        escrowSecretKeyB58,
      }),
      createdAtUnix,
      status: "resolved_success" as const,
      resolvedAtUnix,
      resolvedTxSig: makeSig("personal2:resolved_success"),
    } satisfies CommitmentRecord;
  })();

  const personal3 = (() => {
    const { escrowPubkey, escrowSecretKeyB58 } = makeCommitmentKeypair("personal3");
    const authority = makeWallet("personal3:authority");
    const destinationOnFail = makeWallet("personal3:destinationOnFail");
    const id = makeId("personal3");
    const createdAtUnix = now - 12 * 24 * 60 * 60;
    const deadlineUnix = now - 3 * 24 * 60 * 60;
    const resolvedAtUnix = now - 2 * 24 * 60 * 60;
    return {
      ...createCommitmentRecord({
        id,
        statement: "Open-source core escrow contracts",
        authority,
        destinationOnFail,
        amountLamports: Math.floor(0.75 * 1_000_000_000),
        deadlineUnix,
        escrowPubkey,
        escrowSecretKeyB58,
      }),
      createdAtUnix,
      deadlineUnix,
      status: "resolved_failure" as const,
      resolvedAtUnix,
      resolvedTxSig: makeSig("personal3:resolved_failure"),
    } satisfies CommitmentRecord;
  })();

  const reward1 = (() => {
    const { escrowPubkey, escrowSecretKeyB58 } = makeCommitmentKeypair("reward1");
    const creatorPubkey = makeWallet("reward1:creator");
    const tokenMint = makeWallet("reward1:tokenMint");
    const id = makeId("reward1");
    const createdAtUnix = now - 10 * 24 * 60 * 60;

    const m1Id = makeId("reward1:m1");
    const m2Id = makeId("reward1:m2");
    const m3Id = makeId("reward1:m3");
    const m4Id = makeId("reward1:m4");

    const base = createRewardCommitmentRecord({
      id,
      statement: "Weekly dev-fee unlocks for shipping v2",
      creatorPubkey,
      escrowPubkey,
      escrowSecretKeyB58,
      tokenMint,
      milestones: [
        { id: m1Id, title: "Ship v2 alpha build", unlockLamports: Math.floor(1.0 * 1_000_000_000) },
        { id: m2Id, title: "Ship v2 beta + docs", unlockLamports: Math.floor(1.5 * 1_000_000_000) },
        { id: m3Id, title: "Public mainnet release", unlockLamports: Math.floor(2.0 * 1_000_000_000) },
        { id: m4Id, title: "Post-launch stability week", unlockLamports: Math.floor(0.75 * 1_000_000_000) },
      ],
    });

    const milestones = base.milestones;
    if (!milestones || milestones.length < 4) {
      throw new Error("Invalid seed reward commitment (missing milestones)");
    }

    const m1 = milestones[0];
    const m2 = milestones[1];
    const m3 = milestones[2];
    const m4 = milestones[3];

    const m1Completed = now - 8 * 24 * 60 * 60;
    const m1Claimable = m1Completed + 48 * 60 * 60;
    const m1Released = now - 6 * 24 * 60 * 60;

    const m2Completed = now - 4 * 24 * 60 * 60;
    const m2Claimable = m2Completed + 48 * 60 * 60;
    const m2BecameClaimable = now - 2 * 24 * 60 * 60;

    const m3Completed = now - 12 * 60 * 60;
    const m3Claimable = m3Completed + 48 * 60 * 60;

    const m4Completed = null;

    return {
      ...base,
      createdAtUnix,
      status: "active" as const,
      totalFundedLamports: Math.floor(5.25 * 1_000_000_000),
      unlockedLamports: Math.floor(2.5 * 1_000_000_000),
      milestones: [
        {
          ...m1,
          status: "released" as const,
          completedAtUnix: m1Completed,
          claimableAtUnix: m1Claimable,
          becameClaimableAtUnix: m1Claimable,
          releasedAtUnix: m1Released,
          releasedTxSig: makeSig("reward1:m1:released"),
        },
        {
          ...m2,
          status: "claimable" as const,
          completedAtUnix: m2Completed,
          claimableAtUnix: m2Claimable,
          becameClaimableAtUnix: m2BecameClaimable,
        },
        {
          ...m3,
          status: "locked" as const,
          completedAtUnix: m3Completed,
          claimableAtUnix: m3Claimable,
        },
        {
          ...m4,
          status: "locked" as const,
          completedAtUnix: m4Completed ?? undefined,
          claimableAtUnix: undefined,
        },
      ],
    } satisfies CommitmentRecord;
  })();

  const reward2 = (() => {
    const { escrowPubkey, escrowSecretKeyB58 } = makeCommitmentKeypair("reward2");
    const creatorPubkey = makeWallet("reward2:creator");
    const tokenMint = makeWallet("reward2:tokenMint");
    const id = makeId("reward2");
    const createdAtUnix = now - 22 * 24 * 60 * 60;
    const releasedAtUnix = now - 7 * 24 * 60 * 60;

    const base = createRewardCommitmentRecord({
      id,
      statement: "Milestone rewards for shipping creator tools",
      creatorPubkey,
      escrowPubkey,
      escrowSecretKeyB58,
      tokenMint,
      milestones: [
        { id: makeId("reward2:m1"), title: "Ship creator dashboard", unlockLamports: Math.floor(3 * 1_000_000_000) },
        { id: makeId("reward2:m2"), title: "Ship analytics + alerts", unlockLamports: Math.floor(4 * 1_000_000_000) },
        { id: makeId("reward2:m3"), title: "Ship gasless voting UX", unlockLamports: Math.floor(3 * 1_000_000_000) },
      ],
    });

    return {
      ...base,
      createdAtUnix,
      status: "completed" as const,
      totalFundedLamports: Math.floor(10 * 1_000_000_000),
      unlockedLamports: Math.floor(10 * 1_000_000_000),
      milestones: (base.milestones ?? []).map((m, idx) => {
        const completedAtUnix = releasedAtUnix - (idx + 2) * 24 * 60 * 60;
        const claimableAtUnix = completedAtUnix + 48 * 60 * 60;
        return {
          ...m,
          status: "released" as const,
          completedAtUnix,
          claimableAtUnix,
          becameClaimableAtUnix: claimableAtUnix,
          releasedAtUnix: releasedAtUnix - idx * 12 * 60 * 60,
          releasedTxSig: makeSig(`reward2:m${idx + 1}:released`),
        };
      }),
    } satisfies CommitmentRecord;
  })();

  const reward3 = (() => {
    const { escrowPubkey, escrowSecretKeyB58 } = makeCommitmentKeypair("reward3");
    const creatorPubkey = makeWallet("reward3:creator");
    const tokenMint = makeWallet("reward3:tokenMint");
    const id = makeId("reward3");
    const createdAtUnix = now - 2 * 24 * 60 * 60;

    const base = createRewardCommitmentRecord({
      id,
      statement: "Dev-fee escrow for the next 30 days",
      creatorPubkey,
      escrowPubkey,
      escrowSecretKeyB58,
      tokenMint,
      milestones: [
        { id: makeId("reward3:m1"), title: "Ship patch release", unlockLamports: Math.floor(0.4 * 1_000_000_000) },
        { id: makeId("reward3:m2"), title: "Ship marketing push", unlockLamports: Math.floor(0.6 * 1_000_000_000) },
      ],
    });

    return {
      ...base,
      createdAtUnix,
      status: "active" as const,
      totalFundedLamports: Math.floor(1.1 * 1_000_000_000),
      unlockedLamports: 0,
    } satisfies CommitmentRecord;
  })();

  for (const c of [personal1, reward1, personal2, reward3, personal3, reward2]) {
    mem.commitments.set(c.id, c);
  }

  const seedSignals = (commitmentId: string, milestoneId: string, count: number) => {
    let byMilestone = mem.rewardSignals.get(commitmentId);
    if (!byMilestone) {
      byMilestone = new Map();
      mem.rewardSignals.set(commitmentId, byMilestone);
    }
    let signers = byMilestone.get(milestoneId);
    if (!signers) {
      signers = new Set();
      byMilestone.set(milestoneId, signers);
    }
    while (signers.size < count) {
      const idx = signers.size + 1;
      signers.add(makeKeypair(`signal:${commitmentId}:${milestoneId}:${idx}`).publicKey.toBase58());
    }
  };

  const r1 = reward1;
  const r1Milestones = r1.milestones ?? [];
  if (r1Milestones[0]) seedSignals(r1.id, r1Milestones[0].id, 11);
  if (r1Milestones[1]) seedSignals(r1.id, r1Milestones[1].id, 7);
  if (r1Milestones[2]) seedSignals(r1.id, r1Milestones[2].id, 2);
}

function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

function sha256Bytes(input: string): Uint8Array {
  const h = crypto.createHash("sha256");
  h.update(input, "utf8");
  return new Uint8Array(h.digest());
}

function encryptSecret(plainB58: string): string {
  if (String(plainB58 ?? "").trim().startsWith("privy:")) {
    return String(plainB58).trim();
  }

  const secret = process.env.ESCROW_DB_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("ESCROW_DB_SECRET is required in production");
    }
    return plainB58;
  }

  const key = sha256Bytes(secret);
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const msg = new TextEncoder().encode(plainB58);
  const box = nacl.secretbox(msg, nonce, key);

  const packed = new Uint8Array(nonce.length + box.length);
  packed.set(nonce, 0);
  packed.set(box, nonce.length);
  return `enc:${Buffer.from(packed).toString("base64")}`;
}

function decryptSecret(stored: string): string {
  if (!stored.startsWith("enc:")) return stored;

  const secret = process.env.ESCROW_DB_SECRET;
  if (!secret) throw new Error("ESCROW_DB_SECRET is required to decrypt escrow secrets");

  const key = sha256Bytes(secret);
  const packed = Buffer.from(stored.slice("enc:".length), "base64");
  const nonce = new Uint8Array(packed.subarray(0, nacl.secretbox.nonceLength));
  const box = new Uint8Array(packed.subarray(nacl.secretbox.nonceLength));
  const opened = nacl.secretbox.open(box, nonce, key);
  if (!opened) throw new Error("Failed to decrypt escrow secret");
  return new TextDecoder().decode(opened);
}

async function ensureSchema(): Promise<void> {
  if (!hasDatabase()) return;
  const pool = getPool();
  await pool.query(`
    create table if not exists commitments (
      id text primary key,
      statement text null,
      authority text not null,
      destination_on_fail text not null,
      amount_lamports bigint not null,
      deadline_unix bigint not null,
      escrow_pubkey text not null,
      escrow_secret_key text not null,
      kind text not null default 'personal',
      creator_pubkey text null,
      creator_fee_mode text null,
      token_mint text null,
      total_funded_lamports bigint not null default 0,
      unlocked_lamports bigint not null default 0,
      milestones_json text null,
      status text not null,
      created_at_unix bigint not null,
      resolved_at_unix bigint null,
      resolved_tx_sig text null
    );
    create index if not exists commitments_status_idx on commitments(status);
    create index if not exists commitments_deadline_idx on commitments(deadline_unix);
    create index if not exists commitments_kind_idx on commitments(kind);
  `);

  await pool.query(`alter table commitments add column if not exists statement text null;`);
  await pool.query(`alter table commitments add column if not exists kind text not null default 'personal';`);
  await pool.query(`alter table commitments add column if not exists creator_pubkey text null;`);
  await pool.query(`alter table commitments add column if not exists creator_fee_mode text null;`);
  await pool.query(`alter table commitments add column if not exists token_mint text null;`);
  await pool.query(`alter table commitments add column if not exists total_funded_lamports bigint not null default 0;`);
  await pool.query(`alter table commitments add column if not exists unlocked_lamports bigint not null default 0;`);
  await pool.query(`alter table commitments add column if not exists milestones_json text null;`);

  await pool.query(`
    create table if not exists reward_milestone_signals (
      commitment_id text not null,
      milestone_id text not null,
      signer_pubkey text not null,
      created_at_unix bigint not null,
      primary key (commitment_id, milestone_id, signer_pubkey)
    );
    create index if not exists reward_milestone_signals_commitment_idx on reward_milestone_signals(commitment_id);
    create index if not exists reward_milestone_signals_milestone_idx on reward_milestone_signals(commitment_id, milestone_id);
  `);

  await pool.query(`
    create table if not exists reward_voter_snapshots (
      commitment_id text not null,
      milestone_id text not null,
      signer_pubkey text not null,
      created_at_unix bigint not null,
      project_mint text not null,
      project_ui_amount double precision not null,
      ship_ui_amount double precision not null default 0,
      ship_multiplier_bps integer not null default 10000,
      primary key (commitment_id, milestone_id, signer_pubkey)
    );
    create index if not exists reward_voter_snapshots_commitment_idx on reward_voter_snapshots(commitment_id);
  `);

  await pool.query(`
    create table if not exists failure_distributions (
      id text primary key,
      commitment_id text not null unique,
      created_at_unix bigint not null,
      buyback_lamports bigint not null,
      voter_pot_lamports bigint not null,
      ship_buyback_treasury_pubkey text not null,
      buyback_tx_sig text not null,
      voter_pot_tx_sig text null,
      status text not null
    );
    create index if not exists failure_distributions_commitment_idx on failure_distributions(commitment_id);
  `);

  await pool.query(`
    create table if not exists failure_distribution_allocations (
      distribution_id text not null,
      wallet_pubkey text not null,
      amount_lamports bigint not null,
      weight double precision not null,
      primary key (distribution_id, wallet_pubkey)
    );
    create index if not exists failure_distribution_allocations_distribution_idx on failure_distribution_allocations(distribution_id);
  `);

  await pool.query(`
    create table if not exists failure_distribution_claims (
      distribution_id text not null,
      wallet_pubkey text not null,
      claimed_at_unix bigint not null,
      amount_lamports bigint not null,
      tx_sig text not null,
      primary key (distribution_id, wallet_pubkey)
    );
    create index if not exists failure_distribution_claims_distribution_idx on failure_distribution_claims(distribution_id);
  `);
}

function parseMilestonesJson(raw: any): RewardMilestone[] | undefined {
  if (raw == null) return undefined;
  if (typeof raw !== "string") return undefined;
  const t = raw.trim();
  if (!t.length) return undefined;
  try {
    const parsed = JSON.parse(t);
    if (!Array.isArray(parsed)) return undefined;
    return parsed as RewardMilestone[];
  } catch {
    return undefined;
  }
}

function rowToRecord(row: any): CommitmentRecord {
  return {
    id: row.id,
    statement: row.statement ?? undefined,
    authority: row.authority,
    destinationOnFail: row.destination_on_fail,
    amountLamports: Number(row.amount_lamports),
    deadlineUnix: Number(row.deadline_unix),
    escrowPubkey: row.escrow_pubkey,
    escrowSecretKey: row.escrow_secret_key,
    kind: (row.kind ?? "personal") as CommitmentKind,
    creatorPubkey: row.creator_pubkey ?? undefined,
    creatorFeeMode: row.creator_fee_mode == null ? undefined : (String(row.creator_fee_mode) as CreatorFeeMode),
    tokenMint: row.token_mint ?? undefined,
    totalFundedLamports: Number(row.total_funded_lamports ?? 0),
    unlockedLamports: Number(row.unlocked_lamports ?? 0),
    milestones: parseMilestonesJson(row.milestones_json),
    status: row.status,
    createdAtUnix: Number(row.created_at_unix),
    resolvedAtUnix: row.resolved_at_unix == null ? undefined : Number(row.resolved_at_unix),
    resolvedTxSig: row.resolved_tx_sig ?? undefined,
  };
}

export function createCommitmentRecord(input: {
  id: string;
  statement?: string;
  authority: string;
  destinationOnFail: string;
  amountLamports: number;
  deadlineUnix: number;
  escrowPubkey: string;
  escrowSecretKeyB58: string;
}): CommitmentRecord {
  return {
    id: input.id,
    statement: input.statement,
    authority: input.authority,
    destinationOnFail: input.destinationOnFail,
    amountLamports: input.amountLamports,
    deadlineUnix: input.deadlineUnix,
    escrowPubkey: input.escrowPubkey,
    escrowSecretKey: encryptSecret(input.escrowSecretKeyB58),
    kind: "personal",
    creatorPubkey: undefined,
    totalFundedLamports: 0,
    unlockedLamports: 0,
    milestones: undefined,
    status: "created",
    createdAtUnix: nowUnix(),
  };
}

export function createRewardCommitmentRecord(input: {
  id: string;
  statement?: string;
  creatorPubkey: string;
  escrowPubkey: string;
  escrowSecretKeyB58: string;
  milestones: Array<{ id: string; title: string; unlockLamports: number }>;
  tokenMint?: string;
  creatorFeeMode?: CreatorFeeMode;
}): CommitmentRecord {
  return {
    id: input.id,
    statement: input.statement,
    authority: input.creatorPubkey,
    destinationOnFail: input.creatorPubkey,
    amountLamports: 0,
    deadlineUnix: nowUnix(),
    escrowPubkey: input.escrowPubkey,
    escrowSecretKey: encryptSecret(input.escrowSecretKeyB58),
    kind: "creator_reward",
    creatorPubkey: input.creatorPubkey,
    creatorFeeMode: input.creatorFeeMode ?? "assisted",
    tokenMint: input.tokenMint,
    totalFundedLamports: 0,
    unlockedLamports: 0,
    milestones: input.milestones.map((m) => ({
      id: m.id,
      title: m.title,
      unlockLamports: m.unlockLamports,
      status: "locked" as const,
    })),
    status: "active",
    createdAtUnix: nowUnix(),
  };
}

export function publicView(r: CommitmentRecord): Omit<CommitmentRecord, "escrowSecretKey"> {
  const { escrowSecretKey: _ignored, ...rest } = r;
  return rest;
}

export function getEscrowSecretKeyB58(r: CommitmentRecord): string {
  const raw = decryptSecret(r.escrowSecretKey);
  if (raw.startsWith("privy:")) {
    throw new Error("Escrow key is managed by Privy");
  }
  return raw;
}

export type EscrowSignerRef =
  | { kind: "local"; escrowSecretKeyB58: string }
  | { kind: "privy"; walletId: string };

export function getEscrowSignerRef(r: CommitmentRecord): EscrowSignerRef {
  const raw = decryptSecret(r.escrowSecretKey);
  const trimmed = String(raw ?? "").trim();

  if (trimmed.startsWith("privy:")) {
    const walletId = trimmed.slice("privy:".length).trim();
    if (!walletId) throw new Error("Invalid Privy escrow reference");
    return { kind: "privy", walletId };
  }

  validateEscrowSecretKeyB58(trimmed);
  return { kind: "local", escrowSecretKeyB58: trimmed };
}

export async function insertCommitment(r: CommitmentRecord): Promise<void> {
  await ensureSchema();

  if (!hasDatabase()) {
    mem.commitments.set(r.id, r);
    return;
  }

  const pool = getPool();
  await pool.query(
    `insert into commitments (
      id, statement, authority, destination_on_fail, amount_lamports, deadline_unix,
      escrow_pubkey, escrow_secret_key,
      kind, creator_pubkey, creator_fee_mode, token_mint, total_funded_lamports, unlocked_lamports, milestones_json,
      status, created_at_unix, resolved_at_unix, resolved_tx_sig
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
    [
      r.id,
      r.statement ?? null,
      r.authority,
      r.destinationOnFail,
      String(r.amountLamports),
      String(r.deadlineUnix),
      r.escrowPubkey,
      r.escrowSecretKey,
      r.kind,
      r.creatorPubkey ?? null,
      r.creatorFeeMode ?? null,
      r.tokenMint ?? null,
      String(r.totalFundedLamports ?? 0),
      String(r.unlockedLamports ?? 0),
      r.milestones ? JSON.stringify(r.milestones) : null,
      r.status,
      String(r.createdAtUnix),
      r.resolvedAtUnix == null ? null : String(r.resolvedAtUnix),
      r.resolvedTxSig ?? null,
    ]
  );
}

export function sumReleasedLamports(milestones: RewardMilestone[] | undefined): number {
  if (!milestones || milestones.length === 0) return 0;
  return milestones.reduce((acc, m) => (m.status === "released" ? acc + Number(m.unlockLamports || 0) : acc), 0);
}

export async function upsertRewardMilestoneSignal(input: {
  commitmentId: string;
  milestoneId: string;
  signerPubkey: string;
  createdAtUnix: number;
}): Promise<{ inserted: boolean }> {
  await ensureSchema();

  ensureMockSeeded();

  if (!hasDatabase()) {
    let byMilestone = mem.rewardSignals.get(input.commitmentId);
    if (!byMilestone) {
      byMilestone = new Map();
      mem.rewardSignals.set(input.commitmentId, byMilestone);
    }
    let signers = byMilestone.get(input.milestoneId);
    if (!signers) {
      signers = new Set();
      byMilestone.set(input.milestoneId, signers);
    }
    const before = signers.size;
    signers.add(input.signerPubkey);
    return { inserted: signers.size !== before };
  }

  const pool = getPool();
  const res = await pool.query(
    `insert into reward_milestone_signals (commitment_id, milestone_id, signer_pubkey, created_at_unix)
     values ($1,$2,$3,$4)
     on conflict (commitment_id, milestone_id, signer_pubkey) do nothing
     returning commitment_id`,
    [input.commitmentId, input.milestoneId, input.signerPubkey, String(input.createdAtUnix)]
  );
  return { inserted: Boolean(res.rows[0]) };
}

export async function upsertRewardVoterSnapshot(input: RewardVoterSnapshot): Promise<{ inserted: boolean }> {
  await ensureSchema();

  ensureMockSeeded();

  if (!hasDatabase()) {
    let byMilestone = mem.rewardVoterSnapshots.get(input.commitmentId);
    if (!byMilestone) {
      byMilestone = new Map();
      mem.rewardVoterSnapshots.set(input.commitmentId, byMilestone);
    }
    let bySigner = byMilestone.get(input.milestoneId);
    if (!bySigner) {
      bySigner = new Map();
      byMilestone.set(input.milestoneId, bySigner);
    }
    const before = bySigner.size;
    if (!bySigner.has(input.signerPubkey)) {
      bySigner.set(input.signerPubkey, input);
    }
    return { inserted: bySigner.size !== before };
  }

  const pool = getPool();
  const res = await pool.query(
    `insert into reward_voter_snapshots (
      commitment_id, milestone_id, signer_pubkey, created_at_unix,
      project_mint, project_ui_amount, ship_ui_amount, ship_multiplier_bps
    ) values ($1,$2,$3,$4,$5,$6,$7,$8)
    on conflict (commitment_id, milestone_id, signer_pubkey) do nothing
    returning commitment_id`,
    [
      input.commitmentId,
      input.milestoneId,
      input.signerPubkey,
      String(input.createdAtUnix),
      input.projectMint,
      input.projectUiAmount,
      input.shipUiAmount,
      Math.floor(input.shipMultiplierBps),
    ]
  );
  return { inserted: Boolean(res.rows[0]) };
}

export async function listRewardVoterSnapshots(commitmentId: string): Promise<RewardVoterSnapshot[]> {
  await ensureSchema();
  ensureMockSeeded();

  if (!hasDatabase()) {
    const out: RewardVoterSnapshot[] = [];
    const byMilestone = mem.rewardVoterSnapshots.get(commitmentId);
    if (!byMilestone) return out;
    for (const bySigner of byMilestone.values()) {
      for (const v of bySigner.values()) out.push(v);
    }
    return out;
  }

  const pool = getPool();
  const res = await pool.query(
    `select commitment_id, milestone_id, signer_pubkey, created_at_unix, project_mint, project_ui_amount, ship_ui_amount, ship_multiplier_bps
     from reward_voter_snapshots where commitment_id=$1`,
    [commitmentId]
  );

  return res.rows.map((r) => ({
    commitmentId: String(r.commitment_id),
    milestoneId: String(r.milestone_id),
    signerPubkey: String(r.signer_pubkey),
    createdAtUnix: Number(r.created_at_unix),
    projectMint: String(r.project_mint),
    projectUiAmount: Number(r.project_ui_amount),
    shipUiAmount: Number(r.ship_ui_amount),
    shipMultiplierBps: Number(r.ship_multiplier_bps),
  }));
}

export async function getRewardMilestoneApprovalCounts(commitmentId: string): Promise<RewardMilestoneApprovalCounts> {
  await ensureSchema();

  ensureMockSeeded();

  if (!hasDatabase()) {
    const out: RewardMilestoneApprovalCounts = {};
    const byMilestone = mem.rewardSignals.get(commitmentId);
    if (!byMilestone) return out;
    for (const [milestoneId, signers] of byMilestone.entries()) {
      out[milestoneId] = signers.size;
    }
    return out;
  }

  const pool = getPool();
  const res = await pool.query(
    "select milestone_id, count(*)::int as c from reward_milestone_signals where commitment_id=$1 group by milestone_id",
    [commitmentId]
  );
  const out: RewardMilestoneApprovalCounts = {};
  for (const row of res.rows) {
    out[String(row.milestone_id)] = Number(row.c ?? 0);
  }
  return out;
}

export function getRewardApprovalThreshold(): number {
  const raw = Number(process.env.REWARD_APPROVAL_THRESHOLD ?? "");
  if (Number.isFinite(raw) && raw > 0) return Math.floor(raw);
  return 3;
}

export function normalizeRewardMilestonesClaimable(input: {
  milestones: RewardMilestone[];
  nowUnix: number;
  approvalCounts: RewardMilestoneApprovalCounts;
  approvalThreshold: number;
}): { milestones: RewardMilestone[]; changed: boolean } {
  const { milestones, nowUnix, approvalCounts, approvalThreshold } = input;
  let changed = false;
  const next = milestones.map((m) => {
    if (m.status === "claimable" && m.becameClaimableAtUnix == null) {
      changed = true;
      return {
        ...m,
        becameClaimableAtUnix: m.claimableAtUnix ?? nowUnix,
      };
    }
    if (m.status !== "locked") return m;
    if (m.completedAtUnix == null) return m;
    if (m.claimableAtUnix == null) return m;
    if (nowUnix < m.claimableAtUnix) return m;

    const approvals = Number(approvalCounts[m.id] ?? 0);
    if (approvals < approvalThreshold) return m;

    changed = true;
    return {
      ...m,
      status: "claimable" as const,
      becameClaimableAtUnix: m.becameClaimableAtUnix ?? nowUnix,
    };
  });
  return { milestones: next, changed };
}

export async function updateRewardTotalsAndMilestones(input: {
  id: string;
  totalFundedLamports?: number;
  unlockedLamports?: number;
  milestones?: RewardMilestone[];
  status?: CommitmentStatus;
}): Promise<CommitmentRecord> {
  await ensureSchema();

  if (!hasDatabase()) {
    const current = mem.commitments.get(input.id);
    if (!current) throw new Error("Not found");
    const updated: CommitmentRecord = {
      ...current,
      totalFundedLamports: input.totalFundedLamports ?? current.totalFundedLamports,
      unlockedLamports: input.unlockedLamports ?? current.unlockedLamports,
      milestones: input.milestones ?? current.milestones,
      status: input.status ?? current.status,
    };
    mem.commitments.set(input.id, updated);
    return updated;
  }

  const pool = getPool();

  const fields: string[] = [];
  const values: any[] = [input.id];
  let idx = 2;

  if (input.totalFundedLamports != null) {
    fields.push(`total_funded_lamports=$${idx++}`);
    values.push(String(input.totalFundedLamports));
  }
  if (input.unlockedLamports != null) {
    fields.push(`unlocked_lamports=$${idx++}`);
    values.push(String(input.unlockedLamports));
  }
  if (input.milestones != null) {
    fields.push(`milestones_json=$${idx++}`);
    values.push(JSON.stringify(input.milestones));
  }
  if (input.status != null) {
    fields.push(`status=$${idx++}`);
    values.push(input.status);
  }

  if (fields.length === 0) {
    const current = await getCommitment(input.id);
    if (!current) throw new Error("Not found");
    return current;
  }

  const res = await pool.query(`update commitments set ${fields.join(", ")} where id=$1 returning *`, values);
  const row = res.rows[0];
  if (!row) throw new Error("Not found");
  return rowToRecord(row);
}

export async function finalizeCommitmentStatus(input: {
  id: string;
  status: CommitmentStatus;
  resolvedAtUnix?: number;
  resolvedTxSig?: string;
}): Promise<CommitmentRecord> {
  await ensureSchema();

  if (!hasDatabase()) {
    const current = mem.commitments.get(input.id);
    if (!current || current.status !== "resolving") throw new Error("Commitment not in resolving state");
    const next: CommitmentRecord = {
      ...current,
      status: input.status,
      resolvedAtUnix: input.resolvedAtUnix ?? current.resolvedAtUnix,
      resolvedTxSig: input.resolvedTxSig ?? current.resolvedTxSig,
    };
    mem.commitments.set(input.id, next);
    return next;
  }

  const pool = getPool();
  const res = await pool.query(
    "update commitments set status=$2, resolved_at_unix=$3, resolved_tx_sig=$4 where id=$1 and status='resolving' returning *",
    [
      input.id,
      input.status,
      input.resolvedAtUnix == null ? null : String(input.resolvedAtUnix),
      input.resolvedTxSig ?? null,
    ]
  );
  const row = res.rows[0];
  if (!row) throw new Error("Commitment not in resolving state");
  return rowToRecord(row);
}

export async function releaseFailureSettlementClaim(input: { id: string; restoreStatus: CommitmentStatus }): Promise<void> {
  await ensureSchema();

  if (!hasDatabase()) {
    const current = mem.commitments.get(input.id);
    if (current && current.status === "resolving") {
      mem.commitments.set(input.id, { ...current, status: input.restoreStatus });
    }
    return;
  }

  const pool = getPool();
  await pool.query("update commitments set status=$2 where id=$1 and status='resolving'", [input.id, input.restoreStatus]);
}

export async function getFailureDistributionByCommitmentId(commitmentId: string): Promise<FailureDistributionRecord | null> {
  await ensureSchema();
  ensureMockSeeded();

  if (!hasDatabase()) {
    return mem.failureDistributionsByCommitmentId.get(commitmentId) ?? null;
  }

  const pool = getPool();
  const res = await pool.query("select * from failure_distributions where commitment_id=$1", [commitmentId]);
  const row = res.rows[0];
  if (!row) return null;
  return {
    id: String(row.id),
    commitmentId: String(row.commitment_id),
    createdAtUnix: Number(row.created_at_unix),
    buybackLamports: Number(row.buyback_lamports),
    voterPotLamports: Number(row.voter_pot_lamports),
    shipBuybackTreasuryPubkey: String(row.ship_buyback_treasury_pubkey),
    buybackTxSig: String(row.buyback_tx_sig),
    voterPotTxSig: row.voter_pot_tx_sig == null ? undefined : String(row.voter_pot_tx_sig),
    status: String(row.status) as FailureDistributionStatus,
  };
}

export async function createFailureDistribution(input: {
  distribution: FailureDistributionRecord;
  allocations: FailureDistributionAllocation[];
}): Promise<void> {
  await ensureSchema();

  if (!hasDatabase()) {
    mem.failureDistributionsByCommitmentId.set(input.distribution.commitmentId, input.distribution);
    const byWallet = new Map<string, FailureDistributionAllocation>();
    for (const a of input.allocations) byWallet.set(a.walletPubkey, a);
    mem.failureAllocationsByDistributionId.set(input.distribution.id, byWallet);
    return;
  }

  const pool = getPool();
  await pool.query(
    `insert into failure_distributions (
      id, commitment_id, created_at_unix, buyback_lamports, voter_pot_lamports,
      ship_buyback_treasury_pubkey, buyback_tx_sig, voter_pot_tx_sig, status
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      input.distribution.id,
      input.distribution.commitmentId,
      String(input.distribution.createdAtUnix),
      String(input.distribution.buybackLamports),
      String(input.distribution.voterPotLamports),
      input.distribution.shipBuybackTreasuryPubkey,
      input.distribution.buybackTxSig,
      input.distribution.voterPotTxSig ?? null,
      input.distribution.status,
    ]
  );

  for (const a of input.allocations) {
    await pool.query(
      `insert into failure_distribution_allocations (distribution_id, wallet_pubkey, amount_lamports, weight)
       values ($1,$2,$3,$4)
       on conflict (distribution_id, wallet_pubkey) do nothing`,
      [a.distributionId, a.walletPubkey, String(a.amountLamports), a.weight]
    );
  }
}

export async function getFailureAllocation(input: { distributionId: string; walletPubkey: string }): Promise<FailureDistributionAllocation | null> {
  await ensureSchema();
  ensureMockSeeded();

  if (!hasDatabase()) {
    const byWallet = mem.failureAllocationsByDistributionId.get(input.distributionId);
    return byWallet?.get(input.walletPubkey) ?? null;
  }

  const pool = getPool();
  const res = await pool.query(
    `select distribution_id, wallet_pubkey, amount_lamports, weight
     from failure_distribution_allocations where distribution_id=$1 and wallet_pubkey=$2`,
    [input.distributionId, input.walletPubkey]
  );
  const row = res.rows[0];
  if (!row) return null;
  return {
    distributionId: String(row.distribution_id),
    walletPubkey: String(row.wallet_pubkey),
    amountLamports: Number(row.amount_lamports),
    weight: Number(row.weight),
  };
}

export async function hasFailureClaim(input: { distributionId: string; walletPubkey: string }): Promise<boolean> {
  await ensureSchema();
  ensureMockSeeded();

  if (!hasDatabase()) {
    const byWallet = mem.failureClaimsByDistributionId.get(input.distributionId);
    return Boolean(byWallet?.get(input.walletPubkey));
  }

  const pool = getPool();
  const res = await pool.query(
    `select 1 from failure_distribution_claims where distribution_id=$1 and wallet_pubkey=$2`,
    [input.distributionId, input.walletPubkey]
  );
  return Boolean(res.rows[0]);
}

export async function insertFailureClaim(input: FailureDistributionClaim): Promise<void> {
  await ensureSchema();

  if (!hasDatabase()) {
    let byWallet = mem.failureClaimsByDistributionId.get(input.distributionId);
    if (!byWallet) {
      byWallet = new Map();
      mem.failureClaimsByDistributionId.set(input.distributionId, byWallet);
    }
    byWallet.set(input.walletPubkey, input);
    return;
  }

  const pool = getPool();
  await pool.query(
    `insert into failure_distribution_claims (distribution_id, wallet_pubkey, claimed_at_unix, amount_lamports, tx_sig)
     values ($1,$2,$3,$4,$5)
     on conflict (distribution_id, wallet_pubkey) do nothing`,
    [input.distributionId, input.walletPubkey, String(input.claimedAtUnix), String(input.amountLamports), input.txSig]
  );
}

export async function listCommitments(): Promise<CommitmentRecord[]> {
  await ensureSchema();

  ensureMockSeeded();

  if (!hasDatabase()) {
    return Array.from(mem.commitments.values()).sort((a, b) => b.createdAtUnix - a.createdAtUnix);
  }

  const pool = getPool();
  const res = await pool.query("select * from commitments order by created_at_unix desc");
  return res.rows.map(rowToRecord);
}

export async function getCommitment(id: string): Promise<CommitmentRecord | null> {
  await ensureSchema();

  ensureMockSeeded();

  if (!hasDatabase()) {
    return mem.commitments.get(id) ?? null;
  }

  const pool = getPool();
  const res = await pool.query("select * from commitments where id=$1", [id]);
  const row = res.rows[0];
  return row ? rowToRecord(row) : null;
}

export async function claimForFailureSettlement(id: string): Promise<CommitmentRecord | null> {
  await ensureSchema();

  if (!hasDatabase()) {
    const current = mem.commitments.get(id);
    if (!current) return null;
    if (current.status !== "created" && current.status !== "active") return null;
    const next: CommitmentRecord = { ...current, status: "resolving" };
    mem.commitments.set(id, next);
    return next;
  }

  const pool = getPool();
  const res = await pool.query(
    "update commitments set status='resolving' where id=$1 and status in ('created','active') returning *",
    [id]
  );
  const row = res.rows[0];
  return row ? rowToRecord(row) : null;
}

export async function claimForResolution(id: string): Promise<CommitmentRecord | null> {
  await ensureSchema();

  if (!hasDatabase()) {
    const current = mem.commitments.get(id);
    if (!current) return null;
    if (current.status !== "created") return null;
    const next: CommitmentRecord = { ...current, status: "resolving" };
    mem.commitments.set(id, next);
    return next;
  }

  const pool = getPool();
  const res = await pool.query(
    "update commitments set status='resolving' where id=$1 and status='created' returning *",
    [id]
  );
  const row = res.rows[0];
  return row ? rowToRecord(row) : null;
}

export async function finalizeResolution(input: {
  id: string;
  status: "resolved_success" | "resolved_failure";
  resolvedAtUnix: number;
  resolvedTxSig: string;
}): Promise<CommitmentRecord> {
  await ensureSchema();

  if (!hasDatabase()) {
    const current = mem.commitments.get(input.id);
    if (!current || current.status !== "resolving") throw new Error("Commitment not in resolving state");
    const next: CommitmentRecord = {
      ...current,
      status: input.status,
      resolvedAtUnix: input.resolvedAtUnix,
      resolvedTxSig: input.resolvedTxSig,
    };
    mem.commitments.set(input.id, next);
    return next;
  }

  const pool = getPool();
  const res = await pool.query(
    "update commitments set status=$2, resolved_at_unix=$3, resolved_tx_sig=$4 where id=$1 and status='resolving' returning *",
    [input.id, input.status, String(input.resolvedAtUnix), input.resolvedTxSig]
  );
  const row = res.rows[0];
  if (!row) throw new Error("Commitment not in resolving state");
  return rowToRecord(row);
}

export async function releaseResolutionClaim(id: string): Promise<void> {
  await ensureSchema();

  if (!hasDatabase()) {
    const current = mem.commitments.get(id);
    if (current && current.status === "resolving") {
      mem.commitments.set(id, { ...current, status: "created" });
    }
    return;
  }

  const pool = getPool();
  await pool.query("update commitments set status='created' where id=$1 and status='resolving'", [id]);
}

export function randomId(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function validateEscrowSecretKeyB58(secret: string): void {
  const bytes = bs58.decode(secret);
  if (bytes.length !== 64) {
    throw new Error("Invalid escrow secret key length");
  }
}

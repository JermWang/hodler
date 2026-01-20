import crypto from "crypto";
import { PublicKey } from "@solana/web3.js";

import {
  RewardMilestone,
  countRewardMilestoneSignalsBySigner,
  getCommitment,
  getRewardMilestoneSignalFirstSeenUnixBySigner,
  getVoteRewardDistribution,
  insertVoteRewardDistributionAllocations,
  listRewardVoterSnapshotsByMilestone,
  tryAcquireVoteRewardDistributionCreate,
} from "./escrowStore";
import { getPool, hasDatabase } from "./db";
import { getChainUnixTime, getConnection, getTokenProgramIdForMint, verifyTokenExistsOnChain } from "./solana";

function isVoteRewardDistributionsEnabled(): boolean {
  const raw = String(process.env.CTS_ENABLE_VOTE_REWARD_DISTRIBUTIONS ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function getVoteCutoffSeconds(): number {
  const raw = Number(process.env.REWARD_VOTE_CUTOFF_SECONDS ?? "");
  if (Number.isFinite(raw) && raw > 0) return Math.floor(raw);
  return 24 * 60 * 60;
}

function getParticipationWindowMilestones(): number {
  const raw = Number(process.env.CTS_PARTICIPATION_WINDOW_MILESTONES ?? "");
  if (Number.isFinite(raw) && raw > 0) return Math.floor(raw);
  return 20;
}

function getStreaksGraceMisses(): number {
  const raw = Number(process.env.CTS_STREAKS_GRACE_MISSES ?? "");
  if (Number.isFinite(raw) && raw >= 0) return Math.floor(raw);
  return 2;
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function streaksMultiplierFromMisses(input: { misses: number; graceMisses: number }): number {
  const misses = Math.max(0, Math.floor(Number(input.misses ?? 0)));
  const grace = Math.max(0, Math.floor(Number(input.graceMisses ?? 0)));

  const gracePenalty = 0.05;
  const extraPenalty = 0.1;

  const penalizedGraceMisses = Math.min(misses, grace);
  const extraMisses = Math.max(0, misses - grace);
  const penalty = penalizedGraceMisses * gracePenalty + extraMisses * extraPenalty;
  return clamp(2.0 - penalty, 0.5, 2.0);
}

function getVoteWindowUnix(input: { milestone: RewardMilestone; cutoffSeconds: number }): { startUnix: number; endUnix: number } | null {
  const completedAtUnix = Number(input.milestone.completedAtUnix ?? 0);
  if (!Number.isFinite(completedAtUnix) || completedAtUnix <= 0) return null;

  const reviewOpenedAtUnix = Number((input.milestone as any).reviewOpenedAtUnix ?? 0);
  const dueAtUnix = Number((input.milestone as any).dueAtUnix ?? 0);
  const hasReview = Number.isFinite(reviewOpenedAtUnix) && reviewOpenedAtUnix > 0;
  const hasDue = Number.isFinite(dueAtUnix) && dueAtUnix > 0;

  const startUnix = hasReview ? Math.floor(reviewOpenedAtUnix) : hasDue ? Math.floor(dueAtUnix) : completedAtUnix;
  const endUnix = hasReview ? startUnix + input.cutoffSeconds : hasDue ? Math.floor(dueAtUnix) + input.cutoffSeconds : completedAtUnix + input.cutoffSeconds;
  if (!Number.isFinite(endUnix) || endUnix <= startUnix) return null;
  return { startUnix, endUnix };
}

function getVoteRewardPoolUiAmount(): number {
  const raw = String(process.env.CTS_VOTE_REWARD_POOL_UI_AMOUNT ?? "").trim();
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) return 0;
  return Math.floor(n);
}

function getVoteRewardMode(): "pool" | "fixed" {
  const raw = String(process.env.CTS_VOTE_REWARD_MODE ?? "").trim().toLowerCase();
  if (raw === "fixed" || raw === "per_vote" || raw === "per-vote" || raw === "per_voter" || raw === "per-voter") return "fixed";
  if (raw === "pool") return "pool";

  const perVote = getVoteRewardPerVoteUiAmount();
  const pool = getVoteRewardPoolUiAmount();
  if (perVote > 0 && pool <= 0) return "fixed";
  if (pool > 0 && perVote <= 0) return "pool";
  if (perVote > 0 && pool > 0) return "fixed";
  return "pool";
}

function getVoteRewardPerVoteUiAmount(): number {
  const raw = String(process.env.CTS_VOTE_REWARD_PER_VOTE_UI_AMOUNT ?? "").trim();
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) return 0;
  return Math.floor(n);
}

function getVoteRewardMaxPoolUiAmount(): number {
  const raw = String(process.env.CTS_VOTE_REWARD_MAX_POOL_UI_AMOUNT ?? "").trim();
  if (!raw.length) return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) return 0;
  return Math.floor(n);
}

const MAX_I64 = BigInt("9223372036854775807");

export async function ensureVoteRewardDistributionsForWallet(input: {
  walletPubkey: string;
  maxPairs?: number;
  maxCreates?: number;
}): Promise<{ considered: number; created: number }> {
  const walletPubkey = String(input.walletPubkey ?? "").trim();
  if (!walletPubkey) return { considered: 0, created: 0 };
  if (!hasDatabase()) return { considered: 0, created: 0 };
  if (!isVoteRewardDistributionsEnabled()) return { considered: 0, created: 0 };

  try {
    await getVoteRewardDistribution({ commitmentId: "", milestoneId: "" });
  } catch {
  }

  const shipMintRaw = String(process.env.CTS_SHIP_TOKEN_MINT ?? "").trim();
  const faucetOwnerPubkey = String(process.env.CTS_VOTE_REWARD_FAUCET_OWNER_PUBKEY ?? "").trim();
  if (!shipMintRaw || !faucetOwnerPubkey) return { considered: 0, created: 0 };

  const maxPairs = Math.max(1, Math.min(12, Math.floor(Number(input.maxPairs ?? 8))));
  const maxCreates = Math.max(0, Math.min(5, Math.floor(Number(input.maxCreates ?? 2))));
  if (maxCreates === 0) return { considered: 0, created: 0 };

  const pool = getPool();
  const pairsRes = await pool.query(
    `select commitment_id, milestone_id, max(created_at_unix) as last_seen
     from reward_voter_snapshots
     where signer_pubkey=$1
     group by commitment_id, milestone_id
     order by last_seen desc
     limit ${maxPairs}`,
    [walletPubkey]
  );

  const pairs = (pairsRes.rows ?? []) as Array<{ commitment_id: string; milestone_id: string }>;
  if (!pairs.length) return { considered: 0, created: 0 };

  const connection = getConnection();
  const nowUnix = await getChainUnixTime(connection);

  const mintPk = new PublicKey(shipMintRaw);
  const tokenProgram = await getTokenProgramIdForMint({ connection, mint: mintPk });
  const mintInfo = await verifyTokenExistsOnChain({ connection, mint: mintPk });
  const decimals = Number(mintInfo.decimals ?? 0);
  if (!mintInfo.exists || !mintInfo.isMintAccount || !Number.isFinite(decimals) || decimals < 0 || decimals > 18) {
    return { considered: pairs.length, created: 0 };
  }

  const cutoffSeconds = getVoteCutoffSeconds();
  const mode = getVoteRewardMode();

  let created = 0;
  let considered = 0;

  for (const p of pairs) {
    const commitmentId = String(p?.commitment_id ?? "").trim();
    const milestoneId = String(p?.milestone_id ?? "").trim();
    if (!commitmentId || !milestoneId) continue;

    considered += 1;

    const existing = await getVoteRewardDistribution({ commitmentId, milestoneId });
    if (existing) continue;

    const r = await tryCreateVoteRewardDistribution({
      commitmentId,
      milestoneId,
      nowUnix,
      cutoffSeconds,
      mintPubkey: mintPk.toBase58(),
      tokenProgramPubkey: tokenProgram.toBase58(),
      faucetOwnerPubkey,
      decimals,
      mode,
    });

    if (r.created) {
      created += 1;
      if (created >= maxCreates) break;
    }
  }

  return { considered, created };
}

async function tryCreateVoteRewardDistribution(input: {
  commitmentId: string;
  milestoneId: string;
  nowUnix: number;
  cutoffSeconds: number;
  mintPubkey: string;
  tokenProgramPubkey: string;
  faucetOwnerPubkey: string;
  decimals: number;
  mode: "pool" | "fixed";
}): Promise<{ created: boolean }> {
  const commitmentId = String(input.commitmentId ?? "").trim();
  const milestoneId = String(input.milestoneId ?? "").trim();
  if (!commitmentId || !milestoneId) return { created: false };

  const record = await getCommitment(commitmentId);
  if (!record) return { created: false };
  if (record.kind !== "creator_reward") return { created: false };

  const milestones: RewardMilestone[] = Array.isArray(record.milestones) ? (record.milestones.slice() as RewardMilestone[]) : [];
  const idx = milestones.findIndex((m) => String(m?.id ?? "") === milestoneId);
  if (idx < 0) return { created: false };

  if (String((milestones[idx] as any)?.autoKind ?? "") === "market_cap") return { created: false };

  const voteWindow = getVoteWindowUnix({ milestone: milestones[idx], cutoffSeconds: input.cutoffSeconds });
  if (!voteWindow) return { created: false };
  if (voteWindow.endUnix > input.nowUnix) return { created: false };

  const snapshots = await listRewardVoterSnapshotsByMilestone({ commitmentId, milestoneId });

  const signerPubkeys = Array.from(
    new Set(
      snapshots
        .map((s) => String(s.signerPubkey ?? "").trim())
        .filter(Boolean)
    )
  );

  if (!signerPubkeys.length) return { created: false };

  const participationMultiplierByWallet = new Map<string, number>();

  const endedOpportunities = milestones
    .map((milestone) => {
      const w = getVoteWindowUnix({ milestone, cutoffSeconds: input.cutoffSeconds });
      if (!w) return null;
      if (w.endUnix > input.nowUnix) return null;
      return { milestoneId: milestone.id, startUnix: w.startUnix, endUnix: w.endUnix };
    })
    .filter(Boolean) as Array<{ milestoneId: string; startUnix: number; endUnix: number }>;

  const windowN = getParticipationWindowMilestones();
  const recentWindow = endedOpportunities.sort((a, b) => b.endUnix - a.endUnix || a.milestoneId.localeCompare(b.milestoneId)).slice(0, windowN);
  const windowMilestoneIds = recentWindow.map((m) => m.milestoneId);

  if (signerPubkeys.length && windowMilestoneIds.length) {
    const [voteCounts, firstSeen] = await Promise.all([
      countRewardMilestoneSignalsBySigner({ commitmentId, milestoneIds: windowMilestoneIds, signerPubkeys }),
      getRewardMilestoneSignalFirstSeenUnixBySigner({ commitmentId, signerPubkeys }),
    ]);

    const graceMisses = getStreaksGraceMisses();

    for (const walletPubkey of signerPubkeys) {
      const firstSeenUnix = Number(firstSeen.get(walletPubkey) ?? 0);
      const opportunities = recentWindow.reduce((acc, m) => {
        if (!Number.isFinite(firstSeenUnix) || firstSeenUnix <= 0) return acc + 1;
        return m.endUnix >= firstSeenUnix ? acc + 1 : acc;
      }, 0);
      const votes = Number(voteCounts.get(walletPubkey) ?? 0);

      const safeOpp = Number.isFinite(opportunities) && opportunities > 0 ? Math.floor(opportunities) : 0;
      const safeVotes = Number.isFinite(votes) && votes > 0 ? Math.floor(votes) : 0;
      const misses = safeOpp > 0 ? Math.max(0, safeOpp - safeVotes) : 0;
      participationMultiplierByWallet.set(walletPubkey, streaksMultiplierFromMisses({ misses, graceMisses }));
    }
  }

  const distributionId = crypto.randomBytes(16).toString("hex");
  const allocations: Array<{ distributionId: string; walletPubkey: string; amountRaw: string; weight: number }> = [];
  let poolAmountRawBig = 0n;

  if (input.mode === "fixed") {
    const perVoteUiAmount = getVoteRewardPerVoteUiAmount();
    if (!perVoteUiAmount) return { created: false };

    const perVoteRawBig = BigInt(perVoteUiAmount) * 10n ** BigInt(input.decimals);
    if (perVoteRawBig <= 0n || perVoteRawBig > MAX_I64) return { created: false };
    if (perVoteRawBig > BigInt(Number.MAX_SAFE_INTEGER)) return { created: false };

    const perVoteRawNum = Number(perVoteRawBig);
    let total = 0;

    for (const s of snapshots) {
      const pk = String(s.signerPubkey ?? "").trim();
      if (!pk) continue;

      const shipMultBps = Number((s as any).shipMultiplierBps ?? 10000);
      if (!Number.isFinite(shipMultBps) || shipMultBps <= 0) continue;

      const streakMult = Number(participationMultiplierByWallet.get(pk) ?? 1);
      const mult = (shipMultBps / 10000) * streakMult;
      if (!Number.isFinite(mult) || mult <= 0) continue;

      const amt = Math.floor(perVoteRawNum * mult);
      if (!Number.isFinite(amt) || amt <= 0) continue;

      allocations.push({ distributionId, walletPubkey: pk, amountRaw: String(amt), weight: mult });
      total += amt;
    }

    if (!Number.isFinite(total) || total <= 0) return { created: false };
    if (total > Number.MAX_SAFE_INTEGER) return { created: false };

    const maxPoolUiAmount = getVoteRewardMaxPoolUiAmount();
    if (maxPoolUiAmount) {
      const maxPoolRawBig = BigInt(maxPoolUiAmount) * 10n ** BigInt(input.decimals);
      if (maxPoolRawBig > 0n && BigInt(total) > maxPoolRawBig) return { created: false };
    }

    poolAmountRawBig = BigInt(total);
  } else {
    const poolUiAmount = getVoteRewardPoolUiAmount();
    if (!poolUiAmount) return { created: false };

    poolAmountRawBig = BigInt(poolUiAmount) * 10n ** BigInt(input.decimals);
    if (poolAmountRawBig <= 0n || poolAmountRawBig > MAX_I64) return { created: false };
    if (poolAmountRawBig > BigInt(Number.MAX_SAFE_INTEGER)) return { created: false };

    const weightsByWallet = new Map<string, number>();
    for (const s of snapshots) {
      const pk = String(s.signerPubkey ?? "").trim();
      if (!pk) continue;
      const base = Number((s as any).projectUiAmount ?? 0);
      const multBps = Number((s as any).shipMultiplierBps ?? 10000);
      if (!Number.isFinite(base) || base <= 0) continue;
      if (!Number.isFinite(multBps) || multBps <= 0) continue;

      const baseWeight = base * (multBps / 10000);
      const streakMult = Number(participationMultiplierByWallet.get(pk) ?? 1);
      const w = baseWeight * streakMult;
      if (!Number.isFinite(w) || w <= 0) continue;
      weightsByWallet.set(pk, (weightsByWallet.get(pk) ?? 0) + w);
    }

    const totalWeight = Array.from(weightsByWallet.values()).reduce((acc, v) => acc + v, 0);
    const hasEligibleVoters = Number.isFinite(totalWeight) && totalWeight > 0;

    const poolAmountRawNum = Number(poolAmountRawBig);

    if (hasEligibleVoters && poolAmountRawNum > 0) {
      const entries = Array.from(weightsByWallet.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      let allocated = 0;
      for (const [walletPubkey, weight] of entries) {
        const amt = Math.floor((poolAmountRawNum * weight) / totalWeight);
        if (amt <= 0) continue;
        allocations.push({ distributionId, walletPubkey, amountRaw: String(amt), weight });
        allocated += amt;
      }

      const remainder = poolAmountRawNum - allocated;
      if (remainder > 0 && allocations.length > 0) {
        allocations[0] = { ...allocations[0], amountRaw: String(Number(allocations[0].amountRaw) + remainder) };
      }
    }
  }

  const distribution = {
    id: distributionId,
    commitmentId,
    milestoneId,
    createdAtUnix: Math.floor(input.nowUnix),
    mintPubkey: String(input.mintPubkey),
    tokenProgramPubkey: String(input.tokenProgramPubkey),
    poolAmountRaw: poolAmountRawBig.toString(),
    faucetOwnerPubkey: String(input.faucetOwnerPubkey),
    status: "open" as const,
  };

  const acquired = await tryAcquireVoteRewardDistributionCreate({ distribution });
  const existing = !acquired.acquired ? acquired.existing : null;

  if (existing) {
    if (
      existing.mintPubkey !== distribution.mintPubkey ||
      existing.tokenProgramPubkey !== distribution.tokenProgramPubkey ||
      String(existing.poolAmountRaw) !== String(distribution.poolAmountRaw) ||
      existing.faucetOwnerPubkey !== distribution.faucetOwnerPubkey
    ) {
      return { created: false };
    }
  }

  const distributionToUse = existing ?? distribution;
  const allocationsForDb = allocations.map((a) => ({ ...a, distributionId: distributionToUse.id }));

  await insertVoteRewardDistributionAllocations({ distributionId: distributionToUse.id, allocations: allocationsForDb });

  return { created: true };
}

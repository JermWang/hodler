import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

import {
  CommitmentRecord,
  RewardMilestone,
  getRewardApprovalThreshold,
  getRewardMilestoneVoteCounts,
  getRewardMilestonePayoutClaim,
  listMilestoneFailureDistributionsByCommitmentId,
  listMilestoneFailureDistributionClaims,
  listCommitments,
  normalizeRewardMilestonesClaimable,
  publicView,
  sumReleasedLamports,
  updateDevBuyTokenAmount,
} from "../../../lib/escrowStore";
import { checkRateLimit } from "../../../lib/rateLimit";
import { getServerCommitment } from "../../../lib/rpc";
import { getSafeErrorMessage } from "../../../lib/safeError";
import { getProjectProfile } from "../../../lib/projectProfilesStore";
import { getLaunchTreasuryWallet } from "../../../lib/launchTreasuryStore";
import { getClaimableCreatorFeeLamports } from "../../../lib/pumpfun";
import { getPool, hasDatabase } from "../../../lib/db";

export const runtime = "nodejs";

function computeUnlockedLamports(milestones: RewardMilestone[]): number {
  return milestones.reduce((acc, m) => {
    if (m.status === "claimable" || m.status === "released") return acc + Number(m.unlockLamports || 0);
    return acc;
  }, 0);
}

function effectiveUnlockLamports(m: RewardMilestone, totalFundedLamports: number): number {
  const explicit = Number(m.unlockLamports ?? 0);
  if (Number.isFinite(explicit) && explicit > 0) return Math.floor(explicit);
  const pct = Number((m as any).unlockPercent ?? 0);
  const total = Number(totalFundedLamports ?? 0);
  if (!Number.isFinite(pct) || pct <= 0) return 0;
  if (!Number.isFinite(total) || total <= 0) return 0;
  return Math.floor((total * pct) / 100);
}

function solscanTxUrl(sig: string): string {
  const base = `https://solscan.io/tx/${encodeURIComponent(sig)}`;
  const c = (process.env.NEXT_PUBLIC_SOLANA_CLUSTER || "mainnet-beta").trim();
  if (!c || c === "mainnet-beta") return base;
  return `${base}?cluster=${encodeURIComponent(c)}`;
}

function normalizeTxSig(sig: string | null | undefined): string | null {
  const t = String(sig ?? "").trim();
  if (!t) return null;
  const lowered = t.toLowerCase();
  if (lowered === "pending" || lowered === "none") return null;
  return t;
}

function isRateLimitError(error: unknown): boolean {
  const msg = String((error as any)?.message ?? error).toLowerCase();
  return msg.includes("429") || msg.includes("too many requests");
}

async function getTokenProgramIdNoRetry(connection: Connection, mint: PublicKey, commitment: ReturnType<typeof getServerCommitment>): Promise<PublicKey> {
  const info = await connection.getAccountInfo(mint, commitment);
  const owner = info?.owner;
  if (!owner) throw new Error("Mint not found");
  return owner;
}

async function getBalanceLamportsNoRetry(
  connection: Connection,
  pubkey: PublicKey,
  commitment: ReturnType<typeof getServerCommitment>
): Promise<number> {
  const balance = await connection.getBalance(pubkey, commitment);
  return Number.isFinite(balance) ? balance : 0;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  const maxWorkers = Math.max(1, Math.min(limit, items.length));
  let idx = 0;

  const workers = new Array(maxWorkers).fill(0).map(async () => {
    while (true) {
      const next = idx;
      idx += 1;
      if (next >= items.length) return;
      out[next] = await fn(items[next]);
    }
  });

  await Promise.all(workers);
  return out;
}

async function sumPumpfunCreatorPayoutLamports(input: { walletPubkey: string; treasuryWallet: string | null }): Promise<number> {
  if (!hasDatabase()) return 0;
  const pool = getPool();
  const wallet = String(input.walletPubkey ?? "").trim();
  const treasury = String(input.treasuryWallet ?? "").trim();
  if (!wallet) return 0;

  const res = await pool.query(
    `select sum((fields->>'creatorPayoutLamports')::bigint) as total
     from public.audit_logs
     where event='pumpfun_creator_payout_ok'
       and (fields->>'projectWallet' = $1 or fields->>'creatorWallet' = $2)`,
    [wallet, treasury || wallet]
  );
  const raw = res.rows?.[0]?.total;
  const n = Number(raw ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export async function GET(_req: Request, ctx: { params: { wallet: string } }) {
  try {
    const rl = await checkRateLimit(_req, { keyPrefix: "creator:get", limit: 60, windowSeconds: 60 });
    if (!rl.allowed) {
      const res = NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
      res.headers.set("retry-after", String(rl.retryAfterSeconds));
      return res;
    }

    const walletParam = ctx.params.wallet;
    let walletPubkey: string;
    try {
      walletPubkey = new PublicKey(walletParam).toBase58();
    } catch {
      return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
    }

    let treasuryWallet: string | null = null;
    try {
      const treasury = await getLaunchTreasuryWallet(walletPubkey);
      treasuryWallet = treasury?.treasuryWallet ?? null;
    } catch {
      treasuryWallet = null;
    }

    const allCommitments = await listCommitments();
    const creatorCommitments = allCommitments.filter(
      (c) =>
        c.status !== "archived" &&
        (c.creatorPubkey === walletPubkey ||
          c.authority === walletPubkey ||
          (c.kind === "personal" && c.destinationOnFail === walletPubkey) ||
          (treasuryWallet ? c.authority === treasuryWallet : false) ||
          (treasuryWallet ? (c.kind === "personal" && c.destinationOnFail === treasuryWallet) : false))
    );

    if (creatorCommitments.length === 0) {
      return NextResponse.json({
        wallet: walletPubkey,
        projects: [],
        summary: {
          totalProjects: 0,
          activeProjects: 0,
          completedProjects: 0,
          failedProjects: 0,
          totalMilestones: 0,
          completedMilestones: 0,
          releasedMilestones: 0,
          claimableMilestones: 0,
          totalEarnedLamports: 0,
          totalReleasedLamports: 0,
          totalClaimableLamports: 0,
          totalPendingLamports: 0,
        },
      });
    }

    let rpcRateLimited = false;
    const markRpcRateLimited = (error: unknown) => {
      if (!rpcRateLimited && isRateLimitError(error)) {
        rpcRateLimited = true;
        console.warn("[creator] RPC rate limited, skipping optional RPC calls", {
          wallet: walletPubkey,
        });
      }
    };

    const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
    const rpcCommitment = getServerCommitment();
    const connection = new Connection(rpcUrl, {
      commitment: rpcCommitment,
      disableRetryOnRateLimit: true,
    });
    const nowUnix = Math.floor(Date.now() / 1000);
    const approvalThreshold = getRewardApprovalThreshold();

    let pumpfunFeeStatus: any = null;
    try {
      const managed = creatorCommitments
        .filter((c) => c.kind === "creator_reward" && c.creatorFeeMode === "managed" && c.status !== "archived" && Boolean(c.tokenMint))
        .sort((a, b) => Number(b.createdAtUnix ?? 0) - Number(a.createdAtUnix ?? 0))[0];

      if (managed && treasuryWallet) {
        const tokenMint = String(managed.tokenMint ?? "").trim();

        let campaignId: string | null = null;
        let campaignEscrowWallet: string | null = null;
        let campaignEscrowBalanceLamports: number | null = null;
        let campaignRewardPoolLamports: number | null = null;
        let campaignCreatorFeeLamports: number | null = null;
        let campaignTotalFeeLamports: number | null = null;
        let lastSweepSig: string | null = null;
        let lastSweepAtUnix: number | null = null;
        let lastSweepLamports: number | null = null;
        let lastCreatorPayoutSig: string | null = null;
        let lastCreatorPayoutAtUnix: number | null = null;
        let lastCreatorPayoutLamports: number | null = null;

        if (hasDatabase() && tokenMint) {
          const pool = getPool();
          const cRes = await pool.query(
            `select id, escrow_wallet_pubkey, reward_pool_lamports, platform_fee_lamports, total_fee_lamports
             from public.campaigns
             where token_mint=$1 and status='active'
             order by created_at_unix desc
             limit 1`,
            [tokenMint]
          );
          const row = cRes.rows?.[0] ?? null;
          campaignId = row ? String(row.id ?? "") : null;
          campaignEscrowWallet = row ? (row.escrow_wallet_pubkey ? String(row.escrow_wallet_pubkey) : null) : null;
          campaignRewardPoolLamports = row ? Number(row.reward_pool_lamports ?? 0) || 0 : null;
          campaignCreatorFeeLamports = row ? Number(row.platform_fee_lamports ?? 0) || 0 : null;
          campaignTotalFeeLamports = row ? Number(row.total_fee_lamports ?? 0) || 0 : null;

          const sRes = await pool.query(
            `select ts_unix, fields->>'transferSig' as transfer_sig, fields->>'transferredLamports' as transferred_lamports
             from public.audit_logs
             where event='pumpfun_fee_sweep_ok'
               and fields->>'tokenMint' = $1
             order by ts_unix desc
             limit 1`,
            [tokenMint]
          );
          const sRow = sRes.rows?.[0] ?? null;
          lastSweepSig = sRow ? String(sRow.transfer_sig ?? "").trim() || null : null;
          lastSweepAtUnix = sRow ? Number(sRow.ts_unix ?? 0) || null : null;
          lastSweepLamports = sRow ? Number(sRow.transferred_lamports ?? 0) || null : null;

          const pRes = await pool.query(
            `select ts_unix, fields->>'creatorPayoutSig' as payout_sig, fields->>'creatorPayoutLamports' as payout_lamports
             from public.audit_logs
             where event='pumpfun_creator_payout_ok'
               and fields->>'tokenMint' = $1
             order by ts_unix desc
             limit 1`,
            [tokenMint]
          );
          const pRow = pRes.rows?.[0] ?? null;
          lastCreatorPayoutSig = pRow ? String(pRow.payout_sig ?? "").trim() || null : null;
          lastCreatorPayoutAtUnix = pRow ? Number(pRow.ts_unix ?? 0) || null : null;
          lastCreatorPayoutLamports = pRow ? Number(pRow.payout_lamports ?? 0) || null : null;
        }

        let creatorVault: string | null = null;
        let claimableLamports: number | null = null;
        let rentExemptMinLamports: number | null = null;
        let vaultBalanceLamports: number | null = null;
        let treasuryWalletBalanceLamports: number | null = null;

        if (!rpcRateLimited) {
          try {
            const claimable = await getClaimableCreatorFeeLamports({ connection, creator: new PublicKey(treasuryWallet) });
            creatorVault = claimable.creatorVault.toBase58();
            claimableLamports = Number(claimable.claimableLamports ?? 0);
            rentExemptMinLamports = Number(claimable.rentExemptMinLamports ?? 0);
            vaultBalanceLamports = Number(claimable.vaultBalanceLamports ?? 0);
          } catch (error) {
            markRpcRateLimited(error);
          }
        }

        if (!rpcRateLimited) {
          try {
            treasuryWalletBalanceLamports = Number(
              await getBalanceLamportsNoRetry(connection, new PublicKey(treasuryWallet), rpcCommitment)
            );
          } catch (error) {
            markRpcRateLimited(error);
          }
        }

        if (!rpcRateLimited && campaignEscrowWallet) {
          try {
            const escrowPk = new PublicKey(campaignEscrowWallet);
            campaignEscrowBalanceLamports = Number(await getBalanceLamportsNoRetry(connection, escrowPk, rpcCommitment)) || 0;
          } catch (error) {
            markRpcRateLimited(error);
            campaignEscrowBalanceLamports = null;
          }
        }

        pumpfunFeeStatus = {
          tokenMint: tokenMint || null,
          treasuryWallet,
          treasuryWalletBalanceLamports,
          creatorVault,
          claimableLamports,
          rentExemptMinLamports,
          vaultBalanceLamports,
          campaignId,
          campaignEscrowWallet,
          campaignEscrowBalanceLamports,
          campaignRewardPoolLamports,
          campaignCreatorFeeLamports,
          campaignTotalFeeLamports,
          lastSweepSig,
          lastSweepAtUnix,
          lastSweepLamports,
          lastCreatorPayoutSig,
          lastCreatorPayoutAtUnix,
          lastCreatorPayoutLamports,
        };
      }
    } catch (error) {
      markRpcRateLimited(error);
      pumpfunFeeStatus = null;
    }

    const rewardCommitments = creatorCommitments.filter((c) => c.kind === "creator_reward");
    const concurrency = 2;

    const projects = await mapLimit(rewardCommitments, concurrency, async (commitment) => {
      if (!commitment?.escrowPubkey) return null;

      try {
        const milestones: RewardMilestone[] = Array.isArray((commitment as any).milestones)
          ? (((commitment as any).milestones as RewardMilestone[]).slice() as RewardMilestone[])
          : [];

        const escrowPk = new PublicKey(commitment.escrowPubkey);
        let devBuyTokenAmount = String(commitment.devBuyTokenAmount ?? "").trim();
        const devBuyTokensClaimedRaw = String(commitment.devBuyTokensClaimed ?? "0").trim();

        if (!rpcRateLimited && (!devBuyTokenAmount || devBuyTokenAmount === "0") && commitment.tokenMint) {
          try {
            const mintPk = new PublicKey(commitment.tokenMint);
            const tokenProgramId = await getTokenProgramIdNoRetry(connection, mintPk, rpcCommitment);
            const treasuryAta = getAssociatedTokenAddressSync(mintPk, escrowPk, false, tokenProgramId);
            const ataBalance = await connection.getTokenAccountBalance(treasuryAta, "confirmed");
            const chainBalance = String(ataBalance?.value?.amount ?? "0").trim();
            const claimed = BigInt(devBuyTokensClaimedRaw || "0");
            const total = BigInt(chainBalance || "0") + claimed;
            if (total > 0n) {
              devBuyTokenAmount = total.toString();
              await updateDevBuyTokenAmount({ commitmentId: commitment.id, devBuyTokenAmount });
            }
          } catch (error) {
            markRpcRateLimited(error);
          }
        }

        const balanceLamportsRawPromise = rpcRateLimited
          ? Promise.resolve(null)
          : getBalanceLamportsNoRetry(connection, escrowPk, rpcCommitment).catch((error) => {
              markRpcRateLimited(error);
              return null;
            });

        const [voteCounts, balanceLamportsRaw, projectProfile, failureDistributions] = await Promise.all([
          getRewardMilestoneVoteCounts(commitment.id).catch(() => ({ approvalCounts: {}, rejectCounts: {} } as any)),
          balanceLamportsRawPromise,
          commitment.tokenMint ? getProjectProfile(commitment.tokenMint).catch(() => null) : Promise.resolve(null),
          listMilestoneFailureDistributionsByCommitmentId(commitment.id).catch(() => []),
        ]);

        const approvalCounts = voteCounts.approvalCounts as any;
        const normalized = normalizeRewardMilestonesClaimable({
          milestones,
          nowUnix,
          approvalCounts,
          rejectCounts: (voteCounts as any).rejectCounts,
          approvalThreshold,
        });

        const releasedLamports = sumReleasedLamports(normalized.milestones);
        const unlockedLamports = computeUnlockedLamports(normalized.milestones);
        const fallbackBalanceLamports = Math.max(0, Number(commitment.totalFundedLamports ?? 0) - releasedLamports);
        const balanceLamports =
          Number.isFinite(Number(balanceLamportsRaw)) && Number(balanceLamportsRaw) > 0
            ? Number(balanceLamportsRaw)
            : fallbackBalanceLamports;
        const earnedLamports = Math.max(0, Number(balanceLamports) + releasedLamports);
        const claimableLamports = normalized.milestones
          .filter((m) => m.status === "claimable")
          .reduce((acc, m) => acc + Number(m.unlockLamports || 0), 0);
        const pendingLamports = normalized.milestones
          .filter((m) => m.status === "locked")
          .reduce((acc, m) => acc + Number(m.unlockLamports || 0), 0);

        const milestonesTotal = normalized.milestones.length;
        const milestonesCompleted = normalized.milestones.filter((m) => m.completedAtUnix != null).length;
        const milestonesReleased = normalized.milestones.filter((m) => m.status === "released").length;
        const milestonesClaimable = normalized.milestones.filter((m) => m.status === "claimable").length;

        const withdrawals = (await mapLimit(normalized.milestones, concurrency, async (m) => {
          const releasedTxSig = normalizeTxSig((m as any).releasedTxSig);
          let txSig: string | null = releasedTxSig;
          let claim: any = null;
          if (!txSig) {
            claim = await getRewardMilestonePayoutClaim({ commitmentId: commitment.id, milestoneId: m.id }).catch(() => null);
            txSig = normalizeTxSig(claim?.txSig ?? null);
          }
          if (!txSig) return null;

          const releasedAtUnix = Number((m as any).releasedAtUnix ?? 0);
          const claimCreatedAtUnix = Number(claim?.createdAtUnix ?? 0);
          const unix = releasedAtUnix > 0 ? releasedAtUnix : claimCreatedAtUnix > 0 ? claimCreatedAtUnix : 0;

          const amountLamports = Number.isFinite(Number(claim?.amountLamports)) && Number(claim?.amountLamports) > 0
            ? Number(claim?.amountLamports)
            : effectiveUnlockLamports(m, Number(commitment.totalFundedLamports ?? 0));

          return {
            milestoneId: m.id,
            milestoneTitle: m.title,
            amountLamports,
            releasedAtUnix: unix > 0 ? unix : undefined,
            txSig,
            solscanUrl: solscanTxUrl(txSig),
          };
        }))
          .filter((x) => x != null);

        const failureTransfers = (failureDistributions as any[])
          .flatMap((d) => {
            const out: any[] = [];
            const buybackTxSig = normalizeTxSig(d.buybackTxSig);
            if (buybackTxSig) {
              out.push({
                kind: "milestone_failure_buyback",
                milestoneId: d.milestoneId,
                distributionId: d.id,
                amountLamports: Number(d.buybackLamports ?? 0),
                createdAtUnix: Number(d.createdAtUnix ?? 0),
                txSig: buybackTxSig,
                solscanUrl: solscanTxUrl(buybackTxSig),
              });
            }

            const voterPotTxSig = normalizeTxSig(d.voterPotTxSig);
            const voterPotToTreasuryLamports = Math.max(
              0,
              Number(d.forfeitedLamports ?? 0) - Number(d.buybackLamports ?? 0) - Number(d.voterPotLamports ?? 0)
            );
            if (voterPotTxSig) {
              out.push({
                kind: "milestone_failure_voter_pot_to_treasury",
                milestoneId: d.milestoneId,
                distributionId: d.id,
                amountLamports: voterPotToTreasuryLamports,
                createdAtUnix: Number(d.createdAtUnix ?? 0),
                txSig: voterPotTxSig,
                solscanUrl: solscanTxUrl(voterPotTxSig),
              });
            }

            return out;
          })
          .filter((x) => Number(x.amountLamports ?? 0) > 0);

        const voterClaimsByDist = await mapLimit(failureDistributions as any[], concurrency, async (d) => {
          const claims = await listMilestoneFailureDistributionClaims({ distributionId: d.id }).catch(() => []);
          return { distribution: d, claims };
        });

        const voterPayouts: any[] = [];
        for (const entry of voterClaimsByDist) {
          for (const c of entry.claims as any[]) {
            const txSig = normalizeTxSig(c.txSig);
            if (!txSig) continue;
            voterPayouts.push({
              kind: "milestone_failure_voter_claim",
              milestoneId: entry.distribution.milestoneId,
              distributionId: entry.distribution.id,
              walletPubkey: c.walletPubkey,
              claimedAtUnix: c.claimedAtUnix,
              amountLamports: c.amountLamports,
              txSig,
              solscanUrl: solscanTxUrl(txSig),
            });
          }
        }

        return {
          commitment: publicView({
            ...commitment,
            devBuyTokenAmount,
            devBuyTokensClaimed: devBuyTokensClaimedRaw,
            totalFundedLamports: earnedLamports,
          }),
          projectProfile,
          escrow: {
            balanceLamports: Number(balanceLamports) || 0,
            releasedLamports,
            unlockedLamports,
            claimableLamports,
            pendingLamports,
          },
          milestones: normalized.milestones.map((m, idx) => ({
            ...m,
            index: idx + 1,
            approvalCount: (approvalCounts as any)[m.id] ?? 0,
            approvalThreshold,
          })),
          stats: {
            milestonesTotal,
            milestonesCompleted,
            milestonesReleased,
            milestonesClaimable,
          },
          withdrawals,
          failureTransfers,
          voterPayouts,
          approvalCounts,
          approvalThreshold,
        };
      } catch (error) {
        console.error("[creator] Project build failed", {
          commitmentId: commitment.id,
          wallet: walletPubkey,
          error: getSafeErrorMessage(error),
        });
        return null;
      }
    });

    const sortedProjects = projects
      .filter((project): project is NonNullable<typeof project> => Boolean(project))
      .sort((a, b) => b.commitment.createdAtUnix - a.commitment.createdAtUnix);

    const activeProjects = sortedProjects.filter((p) => p.commitment.status === "active" || p.commitment.status === "created").length;
    const completedProjects = sortedProjects.filter(
      (p) => p.commitment.status === "completed" || p.commitment.status === "resolved_success"
    ).length;
    const failedProjects = sortedProjects.filter((p) => p.commitment.status === "failed" || p.commitment.status === "resolved_failure").length;

    const summary = sortedProjects.reduce(
      (acc, p) => {
        acc.totalMilestones += Number(p.stats?.milestonesTotal ?? 0);
        acc.completedMilestones += Number(p.stats?.milestonesCompleted ?? 0);
        acc.releasedMilestones += Number(p.stats?.milestonesReleased ?? 0);
        acc.claimableMilestones += Number(p.stats?.milestonesClaimable ?? 0);
        acc.totalEarnedLamports += Number(p.escrow?.balanceLamports ?? 0) + Number(p.escrow?.releasedLamports ?? 0);
        acc.totalReleasedLamports += Number(p.escrow?.releasedLamports ?? 0);
        acc.totalClaimableLamports += Number(p.escrow?.claimableLamports ?? 0);
        acc.totalPendingLamports += Number(p.escrow?.pendingLamports ?? 0);
        return acc;
      },
      {
        totalMilestones: 0,
        completedMilestones: 0,
        releasedMilestones: 0,
        claimableMilestones: 0,
        totalEarnedLamports: 0,
        totalReleasedLamports: 0,
        totalClaimableLamports: 0,
        totalPendingLamports: 0,
      }
    );

    const totalCreatorFeesClaimableLamports = Number(pumpfunFeeStatus?.claimableLamports ?? 0) || 0;
    const totalCreatorFeesPaidLamports = await sumPumpfunCreatorPayoutLamports({ walletPubkey, treasuryWallet });
    const totalCreatorFeesEarnedLamports = Math.max(0, totalCreatorFeesPaidLamports + totalCreatorFeesClaimableLamports);

    return NextResponse.json({
      wallet: walletPubkey,
      projects: sortedProjects,
      pumpfunFeeStatus,
      summary: {
        totalProjects: sortedProjects.length,
        activeProjects,
        completedProjects,
        failedProjects,
        totalMilestones: summary.totalMilestones,
        completedMilestones: summary.completedMilestones,
        releasedMilestones: summary.releasedMilestones,
        claimableMilestones: summary.claimableMilestones,
        totalEarnedLamports: summary.totalEarnedLamports,
        totalReleasedLamports: summary.totalReleasedLamports,
        totalClaimableLamports: summary.totalClaimableLamports,
        totalPendingLamports: summary.totalPendingLamports,
        totalCreatorFeesEarnedLamports,
        totalCreatorFeesClaimableLamports,
        totalCreatorFeesPaidLamports,
      },
    });
  } catch (e) {
    console.error("[creator] Failed to load creator dashboard", {
      wallet: ctx?.params?.wallet,
      error: getSafeErrorMessage(e),
    });
    return NextResponse.json({ error: getSafeErrorMessage(e) }, { status: 500 });
  }
}

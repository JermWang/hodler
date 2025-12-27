import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import crypto from "crypto";

import { isAdminRequestAsync } from "../../../../lib/adminAuth";
import { verifyAdminOrigin } from "../../../../lib/adminSession";
import {
  claimForFailureSettlement,
  createFailureDistribution,
  finalizeCommitmentStatus,
  getCommitment,
  getEscrowSecretKeyB58,
  listRewardVoterSnapshots,
  publicView,
  releaseFailureSettlementClaim,
} from "../../../../lib/escrowStore";
import { getBalanceLamports, getChainUnixTime, getConnection, keypairFromBase58Secret, transferAllLamports, transferLamports } from "../../../../lib/solana";
import { getSafeErrorMessage } from "../../../../lib/safeError";

export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: { id: string } }) {
  try {
    verifyAdminOrigin(req);
    if (!(await isAdminRequestAsync(req))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const id = ctx.params.id;

    const current = await getCommitment(id);
    if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const restoreStatus = current.status;

    const claimed = await claimForFailureSettlement(id);
    if (!claimed) {
      return NextResponse.json({ error: "Already resolving/resolved", commitment: publicView(current) }, { status: 409 });
    }

    const connection = getConnection();
    const nowUnix = await getChainUnixTime(connection);

    if (current.kind === "personal") {
      if (nowUnix <= claimed.deadlineUnix) {
        await releaseFailureSettlementClaim({ id, restoreStatus });
        return NextResponse.json({ error: "Too early (deadline not yet passed)" }, { status: 400 });
      }
    }

    const escrow = keypairFromBase58Secret(getEscrowSecretKeyB58(claimed));
    const treasuryRaw = String(process.env.CTS_SHIP_BUYBACK_TREASURY_PUBKEY ?? "").trim();
    if (!treasuryRaw) {
      await releaseFailureSettlementClaim({ id, restoreStatus });
      return NextResponse.json({ error: "CTS_SHIP_BUYBACK_TREASURY_PUBKEY is required" }, { status: 500 });
    }
    const treasury = new PublicKey(treasuryRaw);

    try {
      const balanceLamports = await getBalanceLamports(connection, escrow.publicKey);
      if (balanceLamports <= 0) {
        await releaseFailureSettlementClaim({ id, restoreStatus });
        return NextResponse.json({ error: "Escrow has no lamports" }, { status: 400 });
      }

      const buybackLamports = Math.floor(balanceLamports * 0.5);
      const plannedVoterPotLamports = Math.max(0, balanceLamports - buybackLamports);

      const buybackTx = buybackLamports > 0 ? await transferLamports({ connection, from: escrow, to: treasury, lamports: buybackLamports }) : null;
      const afterBuybackLamports = await getBalanceLamports(connection, escrow.publicKey);

      const snapshots = claimed.kind === "creator_reward" ? await listRewardVoterSnapshots(id) : [];

      const weightsByWallet = new Map<string, number>();
      for (const s of snapshots) {
        const pk = String(s.signerPubkey ?? "").trim();
        if (!pk) continue;
        const base = Number(s.projectUiAmount ?? 0);
        const multBps = Number(s.shipMultiplierBps ?? 10000);
        if (!Number.isFinite(base) || base <= 0) continue;
        if (!Number.isFinite(multBps) || multBps <= 0) continue;
        const w = base * (multBps / 10000);
        if (!Number.isFinite(w) || w <= 0) continue;
        weightsByWallet.set(pk, (weightsByWallet.get(pk) ?? 0) + w);
      }

      let voterPotLamports = Math.max(0, afterBuybackLamports);
      let voterPotTxSig: string | undefined;

      const totalWeight = Array.from(weightsByWallet.values()).reduce((acc, v) => acc + v, 0);
      const distributionId = crypto.randomBytes(16).toString("hex");

      const allocations: Array<{ distributionId: string; walletPubkey: string; amountLamports: number; weight: number }> = [];

      if (!Number.isFinite(totalWeight) || totalWeight <= 0 || voterPotLamports <= 0) {
        if (voterPotLamports > 0) {
          const { signature } = await transferAllLamports({ connection, from: escrow, to: treasury });
          voterPotTxSig = signature;
          voterPotLamports = 0;
        }
      } else {
        const entries = Array.from(weightsByWallet.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
        let allocated = 0;
        for (const [walletPubkey, weight] of entries) {
          const amt = Math.floor((voterPotLamports * weight) / totalWeight);
          if (amt <= 0) continue;
          allocations.push({ distributionId, walletPubkey, amountLamports: amt, weight });
          allocated += amt;
        }

        const remainder = voterPotLamports - allocated;
        if (remainder > 0 && allocations.length > 0) {
          allocations[0] = { ...allocations[0], amountLamports: allocations[0].amountLamports + remainder };
        }
      }

      await createFailureDistribution({
        distribution: {
          id: distributionId,
          commitmentId: id,
          createdAtUnix: nowUnix,
          buybackLamports,
          voterPotLamports: voterPotLamports,
          shipBuybackTreasuryPubkey: treasury.toBase58(),
          buybackTxSig: buybackTx?.signature ?? voterPotTxSig ?? "none",
          voterPotTxSig,
          status: "open",
        },
        allocations,
      });

      const updated = await finalizeCommitmentStatus({
        id,
        status: claimed.kind === "creator_reward" ? "failed" : "resolved_failure",
        resolvedAtUnix: nowUnix,
        resolvedTxSig: buybackTx?.signature ?? voterPotTxSig ?? "none",
      });

      return NextResponse.json({
        ok: true,
        nowUnix,
        plannedVoterPotLamports,
        buyback: {
          treasury: treasury.toBase58(),
          lamports: buybackLamports,
          signature: buybackTx?.signature ?? null,
        },
        voterPot: {
          lamports: voterPotLamports,
          txSig: voterPotTxSig ?? null,
          allocations: allocations.length,
        },
        commitment: publicView(updated),
      });
    } catch (e) {
      await releaseFailureSettlementClaim({ id, restoreStatus });
      return NextResponse.json({ error: getSafeErrorMessage(e) }, { status: 500 });
    }
  } catch (e) {
    return NextResponse.json({ error: getSafeErrorMessage(e) }, { status: 500 });
  }
}

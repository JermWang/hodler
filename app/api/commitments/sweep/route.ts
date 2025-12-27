import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";

import { isAdminRequestAsync } from "../../../lib/adminAuth";
import { verifyAdminOrigin } from "../../../lib/adminSession";
import { claimForFailureSettlement, finalizeCommitmentStatus, getEscrowSecretKeyB58, listCommitments, releaseFailureSettlementClaim } from "../../../lib/escrowStore";
import { getChainUnixTime, getConnection, keypairFromBase58Secret, transferAllLamports, transferLamports } from "../../../lib/solana";
import { getSafeErrorMessage } from "../../../lib/safeError";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    verifyAdminOrigin(req);
    if (!(await isAdminRequestAsync(req))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const connection = getConnection();
    const nowUnix = await getChainUnixTime(connection);

    const commitments = await listCommitments();

    const results: Array<{ id: string; status: string; signature?: string; error?: string }> = [];

    for (const c of commitments) {
      if (c.kind !== "personal") continue;
      if (c.status !== "created") continue;
      if (nowUnix <= c.deadlineUnix) continue;

      const claimed = await claimForFailureSettlement(c.id);
      if (!claimed) continue;

      if (nowUnix <= claimed.deadlineUnix) {
        await releaseFailureSettlementClaim({ id: claimed.id, restoreStatus: "created" });
        continue;
      }

      try {
        const escrow = keypairFromBase58Secret(getEscrowSecretKeyB58(claimed));

        const treasuryRaw = String(process.env.CTS_SHIP_BUYBACK_TREASURY_PUBKEY ?? "").trim();
        if (!treasuryRaw) throw new Error("CTS_SHIP_BUYBACK_TREASURY_PUBKEY is required");
        const treasury = new PublicKey(treasuryRaw);

        const buybackLamports = Math.floor((await connection.getBalance(escrow.publicKey)) * 0.5);
        let signature: string | undefined;
        if (buybackLamports > 0) {
          const res = await transferLamports({ connection, from: escrow, to: treasury, lamports: buybackLamports });
          signature = res.signature;
        }

        const rest = await transferAllLamports({ connection, from: escrow, to: treasury });
        const resolvedSig = signature ?? rest.signature;

        await finalizeCommitmentStatus({
          id: claimed.id,
          status: "resolved_failure",
          resolvedAtUnix: nowUnix,
          resolvedTxSig: resolvedSig,
        });

        results.push({ id: claimed.id, status: "resolved_failure", signature: resolvedSig });
      } catch (e) {
        await releaseFailureSettlementClaim({ id: claimed.id, restoreStatus: "created" });
        results.push({ id: claimed.id, status: "error", error: getSafeErrorMessage(e) });
      }
    }

    return NextResponse.json({ nowUnix, results });
  } catch (e) {
    return NextResponse.json({ error: getSafeErrorMessage(e) }, { status: 500 });
  }
}

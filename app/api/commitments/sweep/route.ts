import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";

import { isAdminRequestAsync } from "../../../lib/adminAuth";
import { verifyAdminOrigin } from "../../../lib/adminSession";
import { checkRateLimit } from "../../../lib/rateLimit";
import { auditLog } from "../../../lib/auditLog";
import { claimForFailureSettlement, finalizeCommitmentStatus, getEscrowSignerRef, listCommitments, releaseFailureSettlementClaim } from "../../../lib/escrowStore";
import {
  getChainUnixTime,
  getConnection,
  keypairFromBase58Secret,
  transferAllLamports,
  transferAllLamportsFromPrivyWallet,
  transferLamports,
  transferLamportsFromPrivyWallet,
} from "../../../lib/solana";
import { getSafeErrorMessage } from "../../../lib/safeError";

export const runtime = "nodejs";

function isCronAuthorized(req: Request): boolean {
  const secret = String(process.env.CRON_SECRET ?? "").trim();
  if (!secret) return false;
  const header = String(req.headers.get("x-cron-secret") ?? "").trim();
  if (!header) return false;
  return header === secret;
}

export async function POST(req: Request) {
  try {
    const rl = await checkRateLimit(req, { keyPrefix: "commitments:sweep", limit: 10, windowSeconds: 60 });
    if (!rl.allowed) {
      const res = NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
      res.headers.set("retry-after", String(rl.retryAfterSeconds));
      return res;
    }

    const cronOk = isCronAuthorized(req);
    if (!cronOk) {
      verifyAdminOrigin(req);
      if (!(await isAdminRequestAsync(req))) {
        await auditLog("admin_sweep_denied", {});
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
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
        const escrowRef = getEscrowSignerRef(claimed);
        const fromPubkey = new PublicKey(claimed.escrowPubkey);

        const treasuryRaw = String(process.env.CTS_SHIP_BUYBACK_TREASURY_PUBKEY ?? "").trim();
        if (!treasuryRaw) throw new Error("CTS_SHIP_BUYBACK_TREASURY_PUBKEY is required");
        const treasury = new PublicKey(treasuryRaw);

        const buybackLamports = Math.floor((await connection.getBalance(fromPubkey)) * 0.5);
        let signature: string | undefined;
        if (buybackLamports > 0) {
          const res =
            escrowRef.kind === "privy"
              ? await transferLamportsFromPrivyWallet({ connection, walletId: escrowRef.walletId, fromPubkey, to: treasury, lamports: buybackLamports })
              : await transferLamports({ connection, from: keypairFromBase58Secret(escrowRef.escrowSecretKeyB58), to: treasury, lamports: buybackLamports });
          signature = res.signature;
        }

        const rest =
          escrowRef.kind === "privy"
            ? await transferAllLamportsFromPrivyWallet({ connection, walletId: escrowRef.walletId, fromPubkey, to: treasury })
            : await transferAllLamports({ connection, from: keypairFromBase58Secret(escrowRef.escrowSecretKeyB58), to: treasury });
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

    await auditLog("admin_sweep_completed", { nowUnix, resultsCount: results.length });
    return NextResponse.json({ nowUnix, results });
  } catch (e) {
    await auditLog("admin_sweep_error", { error: getSafeErrorMessage(e) });
    return NextResponse.json({ error: getSafeErrorMessage(e) }, { status: 500 });
  }
}

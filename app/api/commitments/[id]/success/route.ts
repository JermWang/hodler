import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";

import { isAdminRequestAsync } from "../../../../lib/adminAuth";
import { verifyAdminOrigin } from "../../../../lib/adminSession";
import { checkRateLimit } from "../../../../lib/rateLimit";
import { auditLog } from "../../../../lib/auditLog";
import { claimForResolution, finalizeResolution, getCommitment, getEscrowSignerRef, publicView, releaseResolutionClaim } from "../../../../lib/escrowStore";
import {
  getChainUnixTime,
  getConnection,
  keypairFromBase58Secret,
  transferAllLamports,
  transferAllLamportsFromPrivyWallet,
} from "../../../../lib/solana";
import { getSafeErrorMessage } from "../../../../lib/safeError";

export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: { id: string } }) {
  try {
    const rl = checkRateLimit(req, { keyPrefix: "commitment:success", limit: 30, windowSeconds: 60 });
    if (!rl.allowed) {
      const res = NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
      res.headers.set("retry-after", String(rl.retryAfterSeconds));
      return res;
    }

    verifyAdminOrigin(req);
    if (!(await isAdminRequestAsync(req))) {
      auditLog("admin_commitment_success_denied", { commitmentId: ctx.params.id });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const id = ctx.params.id;

    const current = await getCommitment(id);
    if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (current.kind !== "personal") {
      return NextResponse.json({ error: "This endpoint is only for personal commitments" }, { status: 400 });
    }

    const claimed = await claimForResolution(id);
    if (!claimed) {
      return NextResponse.json({ error: "Already resolving/resolved", commitment: publicView(current) }, { status: 409 });
    }

    const connection = getConnection();
    const nowUnix = await getChainUnixTime(connection);

    if (nowUnix > claimed.deadlineUnix) {
      await releaseResolutionClaim(id);
      return NextResponse.json({ error: "Too late (deadline passed)" }, { status: 400 });
    }

    const to = new PublicKey(claimed.authority);
    const escrowRef = getEscrowSignerRef(claimed);
    const fromPubkey = new PublicKey(claimed.escrowPubkey);

    try {
      const { signature, amountLamports } =
        escrowRef.kind === "privy"
          ? await transferAllLamportsFromPrivyWallet({ connection, walletId: escrowRef.walletId, fromPubkey, to })
          : await transferAllLamports({ connection, from: keypairFromBase58Secret(escrowRef.escrowSecretKeyB58), to });

      const updated = await finalizeResolution({
        id,
        status: "resolved_success",
        resolvedAtUnix: nowUnix,
        resolvedTxSig: signature,
      });

      auditLog("admin_commitment_success_ok", { commitmentId: id, signature, amountLamports });

      return NextResponse.json({
        ok: true,
        signature,
        amountLamports,
        commitment: publicView(updated),
      });
    } catch (e) {
      auditLog("admin_commitment_success_error", { commitmentId: id, error: getSafeErrorMessage(e) });
      await releaseResolutionClaim(id);
      return NextResponse.json({ error: getSafeErrorMessage(e) }, { status: 500 });
    }
  } catch (e) {
    auditLog("admin_commitment_success_error", { commitmentId: ctx.params.id, error: getSafeErrorMessage(e) });
    return NextResponse.json({ error: getSafeErrorMessage(e) }, { status: 500 });
  }
}

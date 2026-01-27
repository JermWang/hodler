import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";

import { isAdminRequestAsync } from "../../../lib/adminAuth";
import { verifyAdminOrigin } from "../../../lib/adminSession";
import { auditLog } from "../../../lib/auditLog";
import { checkRateLimit } from "../../../lib/rateLimit";
import { getSafeErrorMessage, redactSensitive } from "../../../lib/safeError";
import { getLaunchTreasuryWallet } from "../../../lib/launchTreasuryStore";
import { privyRefundWalletToDestination } from "../../../lib/privy";

export const runtime = "nodejs";

const SOLANA_CAIP2 = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"; // mainnet

export async function POST(req: Request) {
  try {
    const rl = await checkRateLimit(req, { keyPrefix: "admin:refund-treasury-by-payer", limit: 10, windowSeconds: 60 });
    if (!rl.allowed) {
      const res = NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
      res.headers.set("retry-after", String(rl.retryAfterSeconds));
      return res;
    }

    try {
      verifyAdminOrigin(req);
    } catch (originErr) {
      await auditLog("admin_refund_treasury_by_payer_denied", {
        reason: "origin_check_failed",
        error: String((originErr as Error).message),
      });
      return NextResponse.json({ error: "Origin check failed" }, { status: 403 });
    }

    if (!(await isAdminRequestAsync(req))) {
      await auditLog("admin_refund_treasury_by_payer_denied", { reason: "unauthorized" });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as any;
    const payerWallet = typeof body?.payerWallet === "string" ? body.payerWallet.trim() : "";
    const destinationWallet = typeof body?.destinationWallet === "string" ? body.destinationWallet.trim() : "";

    if (!payerWallet) {
      return NextResponse.json({ error: "payerWallet is required" }, { status: 400 });
    }

    if (!destinationWallet) {
      return NextResponse.json({ error: "destinationWallet is required" }, { status: 400 });
    }

    let destinationPubkey: PublicKey;
    try {
      destinationPubkey = new PublicKey(destinationWallet);
    } catch {
      return NextResponse.json({ error: "Invalid destination wallet address" }, { status: 400 });
    }

    const treasury = await getLaunchTreasuryWallet(payerWallet);
    if (!treasury?.walletId || !treasury?.treasuryWallet) {
      return NextResponse.json({ error: "Launch treasury wallet not found for payer" }, { status: 404 });
    }

    let treasuryPubkey: PublicKey;
    try {
      treasuryPubkey = new PublicKey(treasury.treasuryWallet);
    } catch {
      return NextResponse.json({ error: "Invalid treasury wallet address" }, { status: 500 });
    }

    const refund = await privyRefundWalletToDestination({
      walletId: treasury.walletId,
      fromPubkey: treasuryPubkey,
      toPubkey: destinationPubkey,
      caip2: SOLANA_CAIP2,
      keepLamports: 10_000,
    });

    if (!refund.ok) {
      await auditLog("admin_refund_treasury_by_payer_error", {
        payerWallet,
        walletId: treasury.walletId,
        treasuryWallet: treasury.treasuryWallet,
        destinationWallet,
        error: refund.error,
      });
      return NextResponse.json(
        {
          ok: false,
          error: refund.error,
          payerWallet,
          walletId: treasury.walletId,
          treasuryWallet: treasury.treasuryWallet,
          logs: refund.logs ?? null,
        },
        { status: 500 }
      );
    }

    await auditLog("admin_refund_treasury_by_payer_ok", {
      payerWallet,
      walletId: treasury.walletId,
      treasuryWallet: treasury.treasuryWallet,
      destinationWallet,
      refundedLamports: refund.refundedLamports,
      signature: refund.signature,
    });

    return NextResponse.json({
      ok: true,
      payerWallet,
      walletId: treasury.walletId,
      treasuryWallet: treasury.treasuryWallet,
      destinationWallet,
      refundAmount: refund.refundedLamports,
      refundSol: refund.refundedLamports / 1e9,
      signature: refund.signature,
      message: `Refunded ${(refund.refundedLamports / 1e9).toFixed(6)} SOL to ${destinationWallet}`,
    });
  } catch (e) {
    const safe = getSafeErrorMessage(e);
    const rawError = redactSensitive(String((e as any)?.message ?? e ?? "Unknown error"));
    await auditLog("admin_refund_treasury_by_payer_error", { error: safe, rawError });
    return NextResponse.json({ error: safe, rawError }, { status: 500 });
  }
}

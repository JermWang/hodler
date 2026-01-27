import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";

import { isAdminRequestAsync } from "../../../lib/adminAuth";
import { verifyAdminOrigin } from "../../../lib/adminSession";
import { auditLog } from "../../../lib/auditLog";
import { checkRateLimit } from "../../../lib/rateLimit";
import { getSafeErrorMessage } from "../../../lib/safeError";
import { privyRefundWalletToDestination, privyGetWalletById } from "../../../lib/privy";

export const runtime = "nodejs";

const SOLANA_CAIP2 = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"; // mainnet

export async function POST(req: Request) {
  try {
    const rl = await checkRateLimit(req, { keyPrefix: "admin:refund-treasury", limit: 10, windowSeconds: 60 });
    if (!rl.allowed) {
      const res = NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
      res.headers.set("retry-after", String(rl.retryAfterSeconds));
      return res;
    }

    try {
      verifyAdminOrigin(req);
    } catch (originErr) {
      await auditLog("admin_refund_treasury_denied", { reason: "origin_check_failed", error: String((originErr as Error).message) });
      return NextResponse.json({ error: "Origin check failed" }, { status: 403 });
    }
    
    if (!(await isAdminRequestAsync(req))) {
      await auditLog("admin_refund_treasury_denied", { reason: "unauthorized" });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as any;
    const walletId = typeof body?.walletId === "string" ? body.walletId.trim() : "";
    const destinationWallet = typeof body?.destinationWallet === "string" ? body.destinationWallet.trim() : "";
    
    if (!walletId) {
      return NextResponse.json({ error: "walletId is required (Privy wallet ID)" }, { status: 400 });
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

    // Get the treasury wallet address from Privy
    const walletInfo = await privyGetWalletById({ walletId });
    const treasuryAddress = walletInfo.address;
    
    let treasuryPubkey: PublicKey;
    try {
      treasuryPubkey = new PublicKey(treasuryAddress);
    } catch {
      return NextResponse.json({ error: "Invalid treasury wallet address from Privy" }, { status: 500 });
    }

    // Use the existing refund function which has retry logic built in
    const refund = await privyRefundWalletToDestination({
      walletId,
      fromPubkey: treasuryPubkey,
      toPubkey: destinationPubkey,
      caip2: SOLANA_CAIP2,
      keepLamports: 10_000,
    });

    if (!refund.ok) {
      await auditLog("admin_refund_treasury_error", { 
        walletId, 
        treasuryAddress, 
        destinationWallet, 
        error: refund.error,
        rawError: (refund as any)?.rawError ?? null,
      });
      return NextResponse.json({ 
        ok: false, 
        error: refund.error,
        rawError: (refund as any)?.rawError ?? null,
        logs: (refund as any)?.logs ?? null,
        treasuryAddress,
        destinationWallet,
      }, { status: 500 });
    }

    await auditLog("admin_refund_treasury_ok", {
      walletId,
      treasuryAddress,
      destinationWallet,
      refundedLamports: refund.refundedLamports,
      refundSol: refund.refundedLamports / 1e9,
      signature: refund.signature,
    });

    return NextResponse.json({ 
      ok: true, 
      treasuryAddress,
      destinationWallet,
      refundAmount: refund.refundedLamports,
      refundSol: refund.refundedLamports / 1e9,
      signature: refund.signature,
      message: `Refunded ${(refund.refundedLamports / 1e9).toFixed(6)} SOL to ${destinationWallet}`
    });
  } catch (e) {
    const rawError = String((e as any)?.message ?? e ?? "Unknown error");
    await auditLog("admin_refund_treasury_error", { error: getSafeErrorMessage(e), rawError });
    return NextResponse.json({ error: getSafeErrorMessage(e), rawError }, { status: 500 });
  }
}

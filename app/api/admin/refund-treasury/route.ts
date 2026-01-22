import { NextResponse } from "next/server";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";

import { isAdminRequestAsync } from "../../../lib/adminAuth";
import { verifyAdminOrigin } from "../../../lib/adminSession";
import { auditLog } from "../../../lib/auditLog";
import { checkRateLimit } from "../../../lib/rateLimit";
import { getSafeErrorMessage } from "../../../lib/safeError";
import { getConnection } from "../../../lib/solana";
import { privySignAndSendSolanaTransaction, privyGetWalletById } from "../../../lib/privy";

export const runtime = "nodejs";

const SOLANA_CAIP2 = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"; // mainnet
const RENT_EXEMPT_MINIMUM = 890_880; // ~0.00089 SOL for rent exemption

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

    const connection = getConnection();
    
    // Get current balance
    const balance = await connection.getBalance(treasuryPubkey, "confirmed");
    
    // Calculate refund amount (leave minimum for rent)
    const refundAmount = Math.max(0, balance - RENT_EXEMPT_MINIMUM - 5000); // 5000 lamports buffer for tx fee
    
    if (refundAmount <= 0) {
      return NextResponse.json({ 
        ok: false, 
        error: "Insufficient balance to refund",
        balance,
        treasuryAddress,
      });
    }

    // Build the refund transaction
    const latest = await connection.getLatestBlockhash("confirmed");
    const tx = new Transaction();
    tx.feePayer = treasuryPubkey;
    tx.recentBlockhash = latest.blockhash;
    tx.lastValidBlockHeight = latest.lastValidBlockHeight;
    tx.add(
      SystemProgram.transfer({
        fromPubkey: treasuryPubkey,
        toPubkey: destinationPubkey,
        lamports: refundAmount,
      })
    );

    const txBase64 = tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");

    // Sign and send via Privy
    const result = await privySignAndSendSolanaTransaction({
      walletId,
      caip2: SOLANA_CAIP2,
      transactionBase64: txBase64,
    });

    await auditLog("admin_refund_treasury_ok", {
      walletId,
      treasuryAddress,
      destinationWallet,
      refundAmount,
      refundSol: refundAmount / 1e9,
      signature: result.signature,
    });

    return NextResponse.json({ 
      ok: true, 
      treasuryAddress,
      destinationWallet,
      refundAmount,
      refundSol: refundAmount / 1e9,
      signature: result.signature,
      message: `Refunded ${(refundAmount / 1e9).toFixed(6)} SOL to ${destinationWallet}`
    });
  } catch (e) {
    const rawError = String((e as any)?.message ?? e ?? "Unknown error");
    await auditLog("admin_refund_treasury_error", { error: getSafeErrorMessage(e), rawError });
    return NextResponse.json({ error: getSafeErrorMessage(e), rawError }, { status: 500 });
  }
}

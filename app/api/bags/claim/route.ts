import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";

import { getConnection, getChainUnixTime } from "../../../lib/solana";
import { getClaimableBalances, getClaimTransactionsBase64 } from "../../../lib/bags";
import { checkRateLimit } from "../../../lib/rateLimit";
import { getSafeErrorMessage } from "../../../lib/safeError";

export const runtime = "nodejs";

function expectedClaimMessage(input: { walletPubkey: string; timestampUnix: number }): string {
  return `AmpliFi\nBags Claim\nWallet: ${input.walletPubkey}\nTimestamp: ${input.timestampUnix}`;
}

/**
 * POST /api/bags/claim
 * 
 * Get claim transactions for a wallet's Bags fee shares.
 * User must sign a message to prove wallet ownership.
 * 
 * Request body:
 * - walletPubkey: string - The wallet address to claim for
 * - timestampUnix: number - Unix timestamp of the signature
 * - signatureB58: string - Base58-encoded signature of the claim message
 * - tokenMint?: string - Optional: specific token to claim from
 * 
 * Response:
 * - ok: boolean
 * - transactions: string[] - Base64-encoded unsigned transactions to sign
 * - totalClaimableLamports: number
 * - walletPubkey: string
 */
export async function POST(req: Request) {
  try {
    const rl = await checkRateLimit(req, { keyPrefix: "bags:claim", limit: 20, windowSeconds: 60 });
    if (!rl.allowed) {
      const res = NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
      res.headers.set("retry-after", String(rl.retryAfterSeconds));
      return res;
    }

    const body = (await req.json().catch(() => null)) as any;
    const walletPubkeyRaw = typeof body?.walletPubkey === "string" ? body.walletPubkey.trim() : "";
    const tokenMint = typeof body?.tokenMint === "string" ? body.tokenMint.trim() : undefined;

    const timestampUnix = Number(body?.timestampUnix);
    const signatureB58 = typeof body?.signatureB58 === "string" ? body.signatureB58.trim() : "";

    if (!walletPubkeyRaw) return NextResponse.json({ error: "walletPubkey is required" }, { status: 400 });
    if (!Number.isFinite(timestampUnix) || timestampUnix <= 0) {
      return NextResponse.json({ error: "timestampUnix is required" }, { status: 400 });
    }
    if (!signatureB58) return NextResponse.json({ error: "signatureB58 is required" }, { status: 400 });

    let walletPubkey: PublicKey;
    try {
      walletPubkey = new PublicKey(walletPubkeyRaw);
    } catch {
      return NextResponse.json({ error: "Invalid walletPubkey" }, { status: 400 });
    }

    const connection = getConnection();
    const nowUnix = await getChainUnixTime(connection);

    const skew = Math.abs(nowUnix - Math.floor(timestampUnix));
    if (skew > 10 * 60) {
      return NextResponse.json({ error: "timestampUnix is too far from current time" }, { status: 400 });
    }

    // Verify signature
    const msg = expectedClaimMessage({ walletPubkey: walletPubkey.toBase58(), timestampUnix: Math.floor(timestampUnix) });
    let sigBytes: Uint8Array;
    try {
      sigBytes = bs58.decode(signatureB58);
    } catch {
      return NextResponse.json({ error: "Invalid signature encoding" }, { status: 400 });
    }
    
    const ok = nacl.sign.detached.verify(new TextEncoder().encode(msg), sigBytes, walletPubkey.toBytes());
    if (!ok) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

    // Get claim transactions from Bags
    const result = await getClaimTransactionsBase64(walletPubkey.toBase58(), tokenMint);

    if (!result.ok) {
      return NextResponse.json({
        error: result.error || "Failed to get claim transactions",
        walletPubkey: walletPubkey.toBase58(),
      }, { status: 500 });
    }

    if (result.transactions.length === 0) {
      return NextResponse.json({
        ok: true,
        nowUnix,
        walletPubkey: walletPubkey.toBase58(),
        totalClaimableLamports: 0,
        transactions: [],
        message: "No claimable fees found",
      });
    }

    return NextResponse.json({
      ok: true,
      nowUnix,
      walletPubkey: walletPubkey.toBase58(),
      totalClaimableLamports: result.totalClaimableLamports,
      transactions: result.transactions,
      txFormat: "base64",
      txType: "bags_claim_fees",
      message: msg,
    });
  } catch (e) {
    return NextResponse.json({ error: getSafeErrorMessage(e) }, { status: 500 });
  }
}

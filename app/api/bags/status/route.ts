import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";

import { getChainUnixTime, getConnection } from "../../../lib/solana";
import { getClaimableBalances, getClaimableBalancesForToken } from "../../../lib/bags";
import { checkRateLimit } from "../../../lib/rateLimit";
import { getSafeErrorMessage } from "../../../lib/safeError";

export const runtime = "nodejs";

/**
 * POST /api/bags/status
 * 
 * Get claimable fee balances for a wallet from Bags.
 * 
 * Request body:
 * - walletPubkey: string - The wallet address to check
 * - tokenMint?: string - Optional: specific token to check
 * 
 * Response:
 * - ok: boolean
 * - walletPubkey: string
 * - totalClaimableLamports: number
 * - positions: array of claimable positions
 */
export async function POST(req: Request) {
  try {
    const rl = await checkRateLimit(req, { keyPrefix: "bags:status", limit: 60, windowSeconds: 60 });
    if (!rl.allowed) {
      const res = NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
      res.headers.set("retry-after", String(rl.retryAfterSeconds));
      return res;
    }

    const body = (await req.json().catch(() => null)) as any;
    const walletPubkeyRaw = typeof body?.walletPubkey === "string" ? body.walletPubkey.trim() : "";
    const tokenMint = typeof body?.tokenMint === "string" ? body.tokenMint.trim() : undefined;

    if (!walletPubkeyRaw) {
      return NextResponse.json({ error: "walletPubkey is required" }, { status: 400 });
    }

    let walletPubkey: PublicKey;
    try {
      walletPubkey = new PublicKey(walletPubkeyRaw);
    } catch {
      return NextResponse.json({ error: "Invalid walletPubkey" }, { status: 400 });
    }

    const connection = getConnection();
    const nowUnix = await getChainUnixTime(connection);

    // Get claimable balances from Bags
    const result = tokenMint
      ? await getClaimableBalancesForToken(walletPubkey.toBase58(), tokenMint)
      : await getClaimableBalances(walletPubkey.toBase58());

    if (!result.ok) {
      return NextResponse.json({
        error: result.error || "Failed to get claimable balances",
        walletPubkey: walletPubkey.toBase58(),
      }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      nowUnix,
      walletPubkey: walletPubkey.toBase58(),
      tokenMint: tokenMint || null,
      totalClaimableLamports: result.totalLamports || 0,
      totalClaimableSol: (result.totalLamports || 0) / 1_000_000_000,
      positions: result.positions || [],
      positionCount: result.positions?.length || 0,
    });
  } catch (e) {
    return NextResponse.json({ error: getSafeErrorMessage(e) }, { status: 500 });
  }
}

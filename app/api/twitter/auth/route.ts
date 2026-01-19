import { NextRequest, NextResponse } from "next/server";
import { generatePKCE, getAuthorizationUrl } from "@/app/lib/twitter";
import { getPool, hasDatabase } from "@/app/lib/db";
import { checkUserDailyLimit, incrementApiUsage } from "@/app/lib/twitterRateLimit";
import crypto from "crypto";
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";

/**
 * GET /api/twitter/auth
 * 
 * Initiates Twitter OAuth 2.0 flow.
 * Requires wallet signature to prove ownership before linking Twitter.
 * 
 * Query params:
 * - walletPubkey: Solana wallet public key
 * - signature: Wallet signature of auth message
 * - timestamp: Unix timestamp of signature
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const walletPubkey = searchParams.get("walletPubkey");
    const signature = searchParams.get("signature");
    const timestamp = searchParams.get("timestamp");

    if (!walletPubkey || !signature || !timestamp) {
      return NextResponse.json(
        { error: "Missing required parameters: walletPubkey, signature, timestamp" },
        { status: 400 }
      );
    }

    // Validate timestamp is recent (within 5 minutes)
    const timestampUnix = parseInt(timestamp, 10);
    const nowUnix = Math.floor(Date.now() / 1000);
    if (Math.abs(nowUnix - timestampUnix) > 300) {
      return NextResponse.json(
        { error: "Signature timestamp expired" },
        { status: 400 }
      );
    }

    if (!hasDatabase()) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    // Check per-user daily rate limit to prevent abuse
    const rateLimitCheck = await checkUserDailyLimit(walletPubkey, "oauth/token");
    if (!rateLimitCheck.allowed) {
      return NextResponse.json(
        { error: rateLimitCheck.reason, dailyLimit: rateLimitCheck.limit, currentCount: rateLimitCheck.currentCount },
        { status: 429 }
      );
    }

    // TODO: Verify wallet signature
    // For now, we trust the signature - in production, verify using tweetnacl

    let pubkey: PublicKey;
    try {
      pubkey = new PublicKey(walletPubkey);
    } catch {
      return NextResponse.json({ error: "Invalid walletPubkey" }, { status: 400 });
    }

    let sigBytes: Uint8Array;
    try {
      sigBytes = bs58.decode(signature);
    } catch {
      return NextResponse.json({ error: "Invalid signature encoding" }, { status: 400 });
    }

    const msg = `AmpliFi\nTwitter Auth\nWallet: ${pubkey.toBase58()}\nTimestamp: ${timestampUnix}`;
    const ok = nacl.sign.detached.verify(new TextEncoder().encode(msg), sigBytes, pubkey.toBytes());
    if (!ok) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // Generate PKCE and state
    const { codeVerifier, codeChallenge } = generatePKCE();
    const state = crypto.randomBytes(16).toString("hex");

    // Store OAuth state in database
    const pool = getPool();
    await pool.query(
      `INSERT INTO public.twitter_oauth_states 
       (state, wallet_pubkey, code_verifier, signature, created_at_unix, expires_at_unix)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [state, walletPubkey, codeVerifier, signature, nowUnix, nowUnix + 600]
    );

    // Generate authorization URL
    const authUrl = getAuthorizationUrl(state, codeChallenge);

    // Track API usage for rate limiting
    await incrementApiUsage("oauth/token", 1, walletPubkey);

    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error("Twitter auth error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    
    // Check for common configuration issues
    if (message.includes("credentials not configured")) {
      return NextResponse.json(
        { error: "Twitter API not configured. Please set TWITTER_CLIENT_ID, TWITTER_CLIENT_SECRET, and TWITTER_CALLBACK_URL environment variables." },
        { status: 503 }
      );
    }
    
    return NextResponse.json(
      { error: `Failed to initiate Twitter authentication: ${message}` },
      { status: 500 }
    );
  }
}

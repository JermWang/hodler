import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { Buffer } from "buffer";

import { buildUnsignedPumpfunBuyTxRegular, getBondingCurveState, BondingCurveState } from "../../../lib/pumpfun";
import { checkRateLimit } from "../../../lib/rateLimit";
import { getSafeErrorMessage } from "../../../lib/safeError";
import { auditLog } from "../../../lib/auditLog";
import { getPool, hasDatabase } from "../../../lib/db";
import { getTokenProgramIdForMint } from "../../../lib/solana";

export const runtime = "nodejs";

const RPC_URL = process.env.HELIUS_RPC_URL || process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

function getConnection(): Connection {
  return new Connection(RPC_URL, { commitment: "confirmed" });
}

export async function POST(req: Request) {
  try {
    const rl = await checkRateLimit(req, { keyPrefix: "pumpfun:buy", limit: 10, windowSeconds: 60 });
    if (!rl.allowed) {
      const res = NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
      res.headers.set("retry-after", String(rl.retryAfterSeconds));
      return res;
    }

    const body = (await req.json().catch(() => null)) as any;
    const buyerPubkey = typeof body?.buyerPubkey === "string" ? body.buyerPubkey.trim() : "";
    const tokenMint = typeof body?.tokenMint === "string" ? body.tokenMint.trim() : "";
    const solAmount = typeof body?.solAmount === "number" ? body.solAmount : parseFloat(body?.solAmount ?? "0");
    const lamportsRaw = body?.lamports;
    const timestampUnix = typeof body?.timestampUnix === "number" ? body.timestampUnix : 0;
    const signatureB58 = typeof body?.signatureB58 === "string" ? body.signatureB58.trim() : "";

    if (!buyerPubkey || !tokenMint) {
      return NextResponse.json({ error: "buyerPubkey and tokenMint are required" }, { status: 400 });
    }

    if (!timestampUnix || !signatureB58) {
      return NextResponse.json({ error: "timestampUnix and signatureB58 are required for authentication" }, { status: 400 });
    }

    // Validate timestamp is recent (within 5 minutes)
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestampUnix) > 300) {
      return NextResponse.json({ error: "Signature expired" }, { status: 401 });
    }

    // Verify signature
    let buyerKey: PublicKey;
    try {
      buyerKey = new PublicKey(buyerPubkey);
    } catch {
      return NextResponse.json({ error: "Invalid buyer public key" }, { status: 400 });
    }

    let sigBytes: Uint8Array;
    try {
      sigBytes = bs58.decode(signatureB58);
    } catch {
      return NextResponse.json({ error: "Invalid signature encoding" }, { status: 400 });
    }

    let lamportsNumber: number | null = null;
    if (typeof lamportsRaw === "string") {
      const s = lamportsRaw.trim();
      if (/^\d+$/.test(s)) {
        const n = Number(s);
        if (Number.isFinite(n)) lamportsNumber = Math.floor(n);
      }
    } else if (typeof lamportsRaw === "number" && Number.isFinite(lamportsRaw)) {
      lamportsNumber = Math.floor(lamportsRaw);
    }

    const expectedMsgLamports =
      lamportsNumber != null
        ? `AmpliFi\nPump.fun Buy\nBuyer: ${buyerPubkey}\nToken: ${tokenMint}\nLamports: ${lamportsNumber}\nTimestamp: ${timestampUnix}`
        : null;
    const expectedMsgSol =
      Number.isFinite(solAmount) && solAmount > 0
        ? `AmpliFi\nPump.fun Buy\nBuyer: ${buyerPubkey}\nToken: ${tokenMint}\nAmount: ${solAmount}\nTimestamp: ${timestampUnix}`
        : null;

    let verified = false;
    let usedKind: "lamports" | "sol" | null = null;
    if (expectedMsgLamports) {
      verified = nacl.sign.detached.verify(new TextEncoder().encode(expectedMsgLamports), sigBytes, buyerKey.toBytes());
      if (verified) usedKind = "lamports";
    }
    if (!verified && expectedMsgSol) {
      verified = nacl.sign.detached.verify(new TextEncoder().encode(expectedMsgSol), sigBytes, buyerKey.toBytes());
      if (verified) usedKind = "sol";
    }

    if (!verified || !usedKind) {
      await auditLog("pumpfun_buy_sig_failed", {
        buyerPubkey,
        tokenMint,
        solAmount: Number.isFinite(solAmount) ? solAmount : null,
        lamports: lamportsNumber != null ? String(lamportsNumber) : null,
        authKind: usedKind,
      });
      return NextResponse.json({ error: "Signature verification failed" }, { status: 401 });
    }

    // Validate token mint
    let mintKey: PublicKey;
    try {
      mintKey = new PublicKey(tokenMint);
    } catch {
      return NextResponse.json({ error: "Invalid token mint" }, { status: 400 });
    }

    if (usedKind === "sol") {
      const n = Math.floor(solAmount * 1e9);
      lamportsNumber = Number.isFinite(n) ? n : null;
    }
    if (lamportsNumber == null || !Number.isFinite(lamportsNumber) || lamportsNumber <= 0) {
      return NextResponse.json(
        { error: "SOL amount too small", hint: "Amount must be at least 0.000000001 SOL (1 lamport)." },
        { status: 400 }
      );
    }

    // Look up creator from commitments table
    if (!hasDatabase()) {
      return NextResponse.json({ error: "Database not available" }, { status: 500 });
    }

    const pool = getPool();
    const result = await pool.query(
      `SELECT creator_pubkey, authority
       FROM commitments
       WHERE token_mint = $1
       ORDER BY created_at_unix DESC
       LIMIT 1`,
      [tokenMint]
    );

    const creatorPubkey = String(result.rows?.[0]?.creator_pubkey ?? "").trim();
    const authorityPubkey = String(result.rows?.[0]?.authority ?? "").trim();
    if (!creatorPubkey && !authorityPubkey) {
      return NextResponse.json({ error: "Token not found" }, { status: 404 });
    }

    const allowedBuyer = buyerPubkey === creatorPubkey || buyerPubkey === authorityPubkey;
    if (!allowedBuyer) {
      await auditLog("pumpfun_buy_unauthorized", { buyerPubkey, tokenMint, creatorPubkey: creatorPubkey || null, authorityPubkey: authorityPubkey || null });
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const connection = getConnection();

    // Fetch bonding curve state for debugging
    let bondingCurveState: BondingCurveState | null = null;
    let creatorKey: PublicKey;
    try {
      bondingCurveState = await getBondingCurveState({ connection, mint: mintKey });
      creatorKey = new PublicKey(bondingCurveState.creator);
      
      // Check if curve is complete (migrated) - would explain buy failures
      if (bondingCurveState.complete) {
        return NextResponse.json({
          error: "Bonding curve is complete - token has migrated to Raydium",
          hint: "This token has completed its bonding curve and migrated to Raydium. Dev buys are no longer possible.",
          bondingCurveState,
        }, { status: 400 });
      }
    } catch (e) {
      // Fallback to database value if bonding curve read fails
      const pumpfunCreatorWallet = authorityPubkey || creatorPubkey;
      creatorKey = new PublicKey(pumpfunCreatorWallet);
      await auditLog("pumpfun_buy_creator_fallback", {
        buyerPubkey,
        tokenMint,
        fallbackCreator: pumpfunCreatorWallet,
        error: String((e as Error)?.message ?? e),
      });
    }
    const lamports = BigInt(lamportsNumber);

    let tokenProgram: PublicKey;
    try {
      tokenProgram = await getTokenProgramIdForMint({ connection, mint: mintKey });
    } catch {
      tokenProgram = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
    }

    let walletBalanceLamports: number | null = null;
    try {
      walletBalanceLamports = await connection.getBalance(buyerKey, "confirmed");
    } catch {
      walletBalanceLamports = null;
    }

    // Use the REGULAR Buy instruction (like token creation does) instead of BuyExactSolIn.
    // BuyExactSolIn has been consistently failing with 6041 errors.
    // Regular Buy uses: tokensToBuy, maxSolCost
    
    if (!bondingCurveState) {
      return NextResponse.json({
        error: "Could not fetch bonding curve state",
        hint: "Unable to read bonding curve reserves to calculate token amount.",
      }, { status: 500 });
    }
    
    // Calculate expected tokens using AMM formula
    const virtualTokenReserves = BigInt(bondingCurveState.virtualTokenReserves);
    const virtualSolReserves = BigInt(bondingCurveState.virtualSolReserves);
    
    // Apply 1% fee to get net SOL
    const feeBps = 100n; // 1%
    const netSol = (lamports * 10000n) / (10000n + feeBps);
    
    // AMM formula: tokens_out = (sol_in * virtual_token_reserves) / (virtual_sol_reserves + sol_in)
    const tokensOut = (netSol * virtualTokenReserves) / (virtualSolReserves + netSol);
    
    // Use 95% of expected tokens as minTokensOut (5% slippage tolerance)
    const tokensToBuy = tokensOut;
    const maxSolCost = lamports + (lamports / 10n); // 10% buffer for slippage
    
    const { tx } = await buildUnsignedPumpfunBuyTxRegular({
      connection,
      user: buyerKey,
      mint: mintKey,
      creator: creatorKey,
      tokenProgram,
      tokensToBuy,
      maxSolCost,
      computeUnitLimit: 300_000,
      computeUnitPriceMicroLamports: 100_000,
    });

    const txBytes = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
    const txBase64 = Buffer.from(new Uint8Array(txBytes)).toString("base64");

    await auditLog("pumpfun_buy_tx_built", {
      buyerPubkey,
      tokenMint,
      solAmount,
      lamports: lamports.toString(),
      tokensToBuy: tokensToBuy.toString(),
      maxSolCost: maxSolCost.toString(),
      instructionType: "Buy",
    });

    return NextResponse.json({
      ok: true,
      txBase64,
      solAmount,
      lamports: lamports.toString(),
      tokenMint,
      tokensToBuy: tokensToBuy.toString(),
      maxSolCost: maxSolCost.toString(),
      bondingCurveState,
      creatorUsed: creatorKey.toBase58(),
    });
  } catch (e) {
    const rawError = String((e as any)?.message ?? e ?? "Unknown error");
    await auditLog("pumpfun_buy_error", { error: getSafeErrorMessage(e), rawError });
    return NextResponse.json({ error: getSafeErrorMessage(e), rawError }, { status: 500 });
  }
}

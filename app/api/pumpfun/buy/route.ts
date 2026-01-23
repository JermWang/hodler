import { NextResponse } from "next/server";
import { Connection, PublicKey, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { Buffer } from "buffer";

import { buildUnsignedPumpfunBuyTx } from "../../../lib/pumpfun";
import { checkRateLimit } from "../../../lib/rateLimit";
import { getSafeErrorMessage } from "../../../lib/safeError";
import { auditLog } from "../../../lib/auditLog";
import { getPool, hasDatabase } from "../../../lib/db";

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

    // IMPORTANT:
    // Pump.fun's buy instruction validates `creator_vault` PDA seeds against the on-chain creator/authority,
    // which for managed launches is the Privy-managed `authority` wallet, not the payout `creator_pubkey`.
    // We must derive `creator_vault` using the same pubkey the Pump.fun program expects.
    const pumpfunCreatorWallet = authorityPubkey || creatorPubkey;
    const creatorKey = new PublicKey(pumpfunCreatorWallet);

    const connection = getConnection();
    const lamports = BigInt(lamportsNumber);

    // Build unsigned buy transaction
    const { tx } = await buildUnsignedPumpfunBuyTx({
      connection,
      user: buyerKey,
      mint: mintKey,
      creator: creatorKey,
      spendableSolInLamports: lamports,
      minTokensOut: 0n,
      computeUnitLimit: 300_000,
      computeUnitPriceMicroLamports: 500_000,
    });

    const msgV0 = new TransactionMessage({
      payerKey: tx.feePayer ?? buyerKey,
      recentBlockhash: tx.recentBlockhash ?? (await connection.getLatestBlockhash("processed")).blockhash,
      instructions: tx.instructions,
    }).compileToV0Message();
    const vtx = new VersionedTransaction(msgV0);

    const sim = await connection.simulateTransaction(vtx, { commitment: "processed", sigVerify: false });
    if (sim.value?.err) {
      const logs = Array.isArray(sim.value?.logs) ? sim.value.logs : [];
      await auditLog("pumpfun_buy_sim_failed", {
        buyerPubkey,
        tokenMint,
        solAmount,
        lamports: lamports.toString(),
        err: sim.value.err,
        logs,
      });
      return NextResponse.json(
        {
          error: "Transaction simulation failed",
          hint: "This transaction did not simulate cleanly on the backend. Phantom may block transactions that cannot be safely simulated.",
          simError: sim.value.err,
          simLogs: logs,
        },
        { status: 400 }
      );
    }

    // Serialize transaction to base64
    const txBytes = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
    const txBase64 = Buffer.from(new Uint8Array(txBytes)).toString("base64");

    await auditLog("pumpfun_buy_tx_built", {
      buyerPubkey,
      tokenMint,
      solAmount,
      lamports: lamports.toString(),
    });

    return NextResponse.json({
      ok: true,
      txBase64,
      solAmount,
      lamports: lamports.toString(),
      tokenMint,
    });
  } catch (e) {
    const rawError = String((e as any)?.message ?? e ?? "Unknown error");
    await auditLog("pumpfun_buy_error", { error: getSafeErrorMessage(e), rawError });
    return NextResponse.json({ error: getSafeErrorMessage(e), rawError }, { status: 500 });
  }
}

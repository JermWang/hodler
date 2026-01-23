import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
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
    const timestampUnix = typeof body?.timestampUnix === "number" ? body.timestampUnix : 0;
    const signatureB58 = typeof body?.signatureB58 === "string" ? body.signatureB58.trim() : "";

    if (!buyerPubkey || !tokenMint || !solAmount || solAmount <= 0) {
      return NextResponse.json({ error: "buyerPubkey, tokenMint, and solAmount > 0 are required" }, { status: 400 });
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
    const expectedMsg = `AmpliFi\nPump.fun Buy\nBuyer: ${buyerPubkey}\nToken: ${tokenMint}\nAmount: ${solAmount}\nTimestamp: ${timestampUnix}`;
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

    const msgBytes = new TextEncoder().encode(expectedMsg);
    const verified = nacl.sign.detached.verify(msgBytes, sigBytes, buyerKey.toBytes());
    if (!verified) {
      await auditLog("pumpfun_buy_sig_failed", { buyerPubkey, tokenMint, solAmount });
      return NextResponse.json({ error: "Signature verification failed" }, { status: 401 });
    }

    // Validate token mint
    let mintKey: PublicKey;
    try {
      mintKey = new PublicKey(tokenMint);
    } catch {
      return NextResponse.json({ error: "Invalid token mint" }, { status: 400 });
    }

    // Look up creator from commitments table
    if (!hasDatabase()) {
      return NextResponse.json({ error: "Database not available" }, { status: 500 });
    }

    const pool = getPool();
    const result = await pool.query(
      `SELECT creator_pubkey FROM commitments WHERE token_mint = $1 ORDER BY created_at_unix DESC LIMIT 1`,
      [tokenMint]
    );

    const creatorPubkey = String(result.rows?.[0]?.creator_pubkey ?? "").trim();
    if (!creatorPubkey) {
      return NextResponse.json({ error: "Token not found" }, { status: 404 });
    }

    if (buyerPubkey !== creatorPubkey) {
      await auditLog("pumpfun_buy_unauthorized", { buyerPubkey, tokenMint, creatorPubkey });
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const creatorKey = new PublicKey(creatorPubkey);

    const connection = getConnection();
    const lamports = BigInt(Math.floor(solAmount * 1e9));

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

    const sim = await connection.simulateTransaction(tx, { commitment: "processed", sigVerify: false });
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

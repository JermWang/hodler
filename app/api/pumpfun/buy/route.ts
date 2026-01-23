import { NextResponse } from "next/server";
import { Connection, PublicKey, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { Buffer } from "buffer";

import { buildUnsignedPumpfunBuyTx, getBondingCurveCreator } from "../../../lib/pumpfun";
import { checkRateLimit } from "../../../lib/rateLimit";
import { getSafeErrorMessage } from "../../../lib/safeError";
import { auditLog } from "../../../lib/auditLog";
import { getPool, hasDatabase } from "../../../lib/db";
import { getAssociatedTokenAddress, getTokenProgramIdForMint } from "../../../lib/solana";

const PUMP_PROGRAM_ID = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
const BUY_EXACT_SOL_IN_DISCRIMINATOR = Buffer.from([56, 252, 116, 8, 158, 223, 205, 95]);

function isPumpCustomError(input: any, code: number): boolean {
  const ixErr = input?.InstructionError;
  if (!Array.isArray(ixErr) || ixErr.length < 2) return false;
  const custom = ixErr?.[1]?.Custom;
  return Number(custom) === Number(code);
}

function decodeBuyExactSolInFromTx(
  instructions: Array<{ programId: PublicKey; data: Buffer | Uint8Array }>,
  u64ArgOrder: "spendable_min" | "min_spendable"
):
  | {
      spendableSolInLamports: string;
      minTokensOut: string;
      trackVolume: boolean;
      dataLen: number;
    }
  | null {
  for (const ix of instructions) {
    if (!ix?.programId?.equals(PUMP_PROGRAM_ID)) continue;
    const raw = Buffer.isBuffer(ix.data) ? ix.data : Buffer.from(ix.data);
    if (raw.length < 25) continue;
    if (!raw.subarray(0, 8).equals(BUY_EXACT_SOL_IN_DISCRIMINATOR)) continue;
    const first = raw.readBigUInt64LE(8);
    const second = raw.readBigUInt64LE(16);
    const trackVolumeByte = raw.readUInt8(24);

    const spendable = u64ArgOrder === "min_spendable" ? second : first;
    const minOut = u64ArgOrder === "min_spendable" ? first : second;
    return {
      spendableSolInLamports: spendable.toString(),
      minTokensOut: minOut.toString(),
      trackVolume: trackVolumeByte !== 0,
      dataLen: raw.length,
    };
  }
  return null;
}

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

    // CRITICAL: Read the creator directly from the on-chain bonding curve.
    // The creator_vault PDA must be derived from bonding_curve.creator, NOT from our database.
    // Using the wrong creator causes 6041 errors because the PDA doesn't match.
    let creatorKey: PublicKey;
    try {
      creatorKey = await getBondingCurveCreator({ connection, mint: mintKey });
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

    const ata = getAssociatedTokenAddress({ owner: buyerKey, mint: mintKey, tokenProgram });
    let ataExists: boolean | null = null;
    let ataRentLamports: number | null = null;
    try {
      const info = await connection.getAccountInfo(ata, "confirmed");
      ataExists = Boolean(info);
      if (!info) {
        // SPL token account base size. Token-2022 accounts can be larger depending on extensions.
        ataRentLamports = await connection.getMinimumBalanceForRentExemption(165);
      }
    } catch {
      ataExists = null;
      ataRentLamports = null;
    }

    const tryBuildSim = async (input: { u64ArgOrder: "spendable_min" | "min_spendable"; trackVolume: boolean }) => {
      const { tx } = await buildUnsignedPumpfunBuyTx({
        connection,
        user: buyerKey,
        mint: mintKey,
        creator: creatorKey,
        tokenProgram,
        spendableSolInLamports: lamports,
        minTokensOut: 0n,
        buyExactSolInU64ArgOrder: input.u64ArgOrder,
        trackVolume: input.trackVolume,
        computeUnitLimit: 300_000,
        computeUnitPriceMicroLamports: 500_000,
      });

      const decoded = decodeBuyExactSolInFromTx(tx.instructions.map((ix) => ({ programId: ix.programId, data: ix.data })), input.u64ArgOrder);

      const msgV0 = new TransactionMessage({
        payerKey: tx.feePayer ?? buyerKey,
        recentBlockhash: tx.recentBlockhash ?? (await connection.getLatestBlockhash("processed")).blockhash,
        instructions: tx.instructions,
      }).compileToV0Message();
      const vtx = new VersionedTransaction(msgV0);

      const sim = await connection.simulateTransaction(vtx, { commitment: "processed", sigVerify: false });
      return { tx, sim, decoded, u64ArgOrder: input.u64ArgOrder, trackVolume: input.trackVolume };
    };

    const attempts: Array<Awaited<ReturnType<typeof tryBuildSim>>> = [];
    const candidates: Array<{ u64ArgOrder: "spendable_min" | "min_spendable"; trackVolume: boolean }> = [
      // NOTE: On-chain behavior contradicts IDL. Program expects min_tokens_out first.
      { u64ArgOrder: "min_spendable", trackVolume: false },
      { u64ArgOrder: "min_spendable", trackVolume: true },
    ];

    let attempt: Awaited<ReturnType<typeof tryBuildSim>> | null = null;
    for (const c of candidates) {
      const a = await tryBuildSim(c);
      attempts.push(a);
      if (!a.sim.value?.err) {
        attempt = a;
        break;
      }
    }

    if (!attempt) {
      const last = attempts[attempts.length - 1];
      const logs = Array.isArray(last?.sim.value?.logs) ? last.sim.value.logs : [];
      const err = last?.sim.value?.err;

      if (isPumpCustomError(err, 6040) || isPumpCustomError(err, 6041)) {
        const kind = isPumpCustomError(err, 6040) ? "rent" : "fees";

        const safetyBufferLamports = 5_000_000; // 0.005 SOL safety buffer for rent/fees variance
        const reservedLamports = (ataExists === false ? Number(ataRentLamports ?? 0) : 0) + safetyBufferLamports;
        const suggestedMaxSpendableLamports =
          walletBalanceLamports != null
            ? Math.max(0, walletBalanceLamports - reservedLamports)
            : null;

        // Still return the transaction despite simulation warning.
        // The launch page doesn't simulate at all and works fine.
        // Let the user/wallet decide whether to proceed.
        const bestAttempt = attempts.find((a) => a.u64ArgOrder === "min_spendable" && !a.trackVolume) ?? attempts[0];
        const txBytes = bestAttempt.tx.serialize({ requireAllSignatures: false, verifySignatures: false });
        const txBase64 = Buffer.from(new Uint8Array(txBytes)).toString("base64");

        await auditLog("pumpfun_buy_sim_warning", {
          buyerPubkey,
          tokenMint,
          solAmount,
          lamports: lamports.toString(),
          kind,
          walletBalanceLamports,
          suggestedMaxSpendableLamports,
          u64ArgOrder: bestAttempt.u64ArgOrder,
          trackVolume: bestAttempt.trackVolume,
        });

        return NextResponse.json({
          ok: true,
          txBase64,
          solAmount,
          lamports: lamports.toString(),
          tokenMint,
          warning: `Simulation indicated wallet may not cover ${kind}. Transaction returned anyway.`,
          walletBalanceLamports,
          walletBalanceSol: walletBalanceLamports != null ? walletBalanceLamports / 1e9 : null,
          suggestedMaxSpendableLamports,
          suggestedMaxSpendableSol: suggestedMaxSpendableLamports != null ? suggestedMaxSpendableLamports / 1e9 : null,
        });
      }

      // Return the transaction anyway - launch page doesn't simulate and works fine.
      // Let the user/Phantom decide whether to proceed.
      const bestAttempt = attempts.find((a) => a.u64ArgOrder === "min_spendable" && !a.trackVolume) ?? attempts[0];
      const txBytes = bestAttempt.tx.serialize({ requireAllSignatures: false, verifySignatures: false });
      const txBase64 = Buffer.from(new Uint8Array(txBytes)).toString("base64");

      await auditLog("pumpfun_buy_sim_warning_other", {
        buyerPubkey,
        tokenMint,
        solAmount,
        lamports: lamports.toString(),
        authKind: usedKind,
        err,
        u64ArgOrder: bestAttempt.u64ArgOrder,
        trackVolume: bestAttempt.trackVolume,
      });

      return NextResponse.json({
        ok: true,
        txBase64,
        solAmount,
        lamports: lamports.toString(),
        tokenMint,
        warning: "Simulation failed but transaction returned anyway. Phantom may still accept it.",
        simError: err,
        simLogs: logs,
      });
    }

    const txBytes = attempt.tx.serialize({ requireAllSignatures: false, verifySignatures: false });
    const txBase64 = Buffer.from(new Uint8Array(txBytes)).toString("base64");

    await auditLog("pumpfun_buy_tx_built", {
      buyerPubkey,
      tokenMint,
      solAmount,
      lamports: lamports.toString(),
      u64ArgOrder: attempt.u64ArgOrder,
      trackVolume: attempt.trackVolume,
      decoded: attempt.decoded,
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

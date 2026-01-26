import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { Buffer } from "buffer";

import { checkRateLimit } from "../../../../lib/rateLimit";
import { auditLog } from "../../../../lib/auditLog";
import { getSafeErrorMessage } from "../../../../lib/safeError";
import { verifyCreatorAuthOrThrow } from "../../../../lib/creatorAuth";
import { getCommitment, getEscrowSignerRef, updateDevBuyTokenAmount } from "../../../../lib/escrowStore";
import { getConnection, getAssociatedTokenAddress, getTokenProgramIdForMint } from "../../../../lib/solana";
import { confirmSignatureViaRpc, getServerCommitment, withRetry, withRpcFallback } from "../../../../lib/rpc";
import { privySignSolanaTransaction } from "../../../../lib/privy";
import { buildUnsignedPumpfunBuyTxRegular, getBondingCurveState } from "../../../../lib/pumpfun";
import { SystemProgram, Transaction } from "@solana/web3.js";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ wallet: string }> }) {
  const { wallet } = await params;
  const creatorWallet = String(wallet ?? "").trim();

  try {
    const rl = await checkRateLimit(req, { keyPrefix: `creator:dev-buy:${creatorWallet}`, limit: 5, windowSeconds: 60 });
    if (!rl.allowed) {
      const res = NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
      res.headers.set("retry-after", String(rl.retryAfterSeconds));
      return res;
    }

    if (!creatorWallet) {
      return NextResponse.json({ error: "Wallet address required" }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as any;
    const commitmentId = typeof body?.commitmentId === "string" ? body.commitmentId.trim() : "";
    const tokenMint = typeof body?.tokenMint === "string" ? body.tokenMint.trim() : "";

    const lamportsRaw = body?.lamports;
    const solAmountRaw = body?.solAmount;

    if (!commitmentId) return NextResponse.json({ error: "commitmentId required" }, { status: 400 });
    if (!tokenMint) return NextResponse.json({ error: "tokenMint required" }, { status: 400 });

    let creatorPubkey: PublicKey;
    try {
      creatorPubkey = new PublicKey(creatorWallet);
    } catch {
      return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
    }

    try {
      verifyCreatorAuthOrThrow({
        payload: body?.creatorAuth,
        action: "dev_buy",
        expectedWalletPubkey: creatorWallet,
        maxSkewSeconds: 5 * 60,
      });
    } catch (e) {
      const msg = (e as Error)?.message ?? String(e);
      await auditLog("creator_dev_buy_auth_failed", { creatorWallet, commitmentId, tokenMint, error: msg });
      return NextResponse.json({ error: msg }, { status: 401 });
    }

    const commitment = await getCommitment(commitmentId);
    if (!commitment) {
      return NextResponse.json({ error: "Commitment not found" }, { status: 404 });
    }

    if (String(commitment.creatorPubkey ?? "").trim() !== creatorWallet) {
      await auditLog("creator_dev_buy_unauthorized", {
        creatorWallet,
        commitmentId,
        expectedCreator: commitment.creatorPubkey ?? null,
      });
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    if (String(commitment.tokenMint ?? "").trim() !== tokenMint) {
      return NextResponse.json({ error: "tokenMint mismatch" }, { status: 400 });
    }

    let treasuryPubkey: PublicKey;
    try {
      treasuryPubkey = new PublicKey(String(commitment.escrowPubkey));
    } catch {
      return NextResponse.json({ error: "Invalid dev wallet" }, { status: 500 });
    }

    const signerRef = getEscrowSignerRef(commitment);
    if (signerRef.kind !== "privy") {
      return NextResponse.json({ error: "Dev wallet not managed by Privy" }, { status: 400 });
    }

    const privyWalletId = signerRef.walletId;

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

    const solAmountParsed = typeof solAmountRaw === "number" ? solAmountRaw : parseFloat(String(solAmountRaw ?? "0"));
    if ((lamportsNumber == null || lamportsNumber <= 0) && Number.isFinite(solAmountParsed) && solAmountParsed > 0) {
      const n = Math.floor(solAmountParsed * 1e9);
      lamportsNumber = Number.isFinite(n) ? n : null;
    }

    if (lamportsNumber == null || !Number.isFinite(lamportsNumber) || lamportsNumber <= 0) {
      return NextResponse.json(
        { error: "SOL amount too small", hint: "Amount must be at least 0.000000001 SOL (1 lamport)." },
        { status: 400 }
      );
    }

    const lamports = BigInt(lamportsNumber);

    const connection = getConnection();

    const fundingPlan = await withRpcFallback(async (rpcConn) => {
      const mintPk = new PublicKey(tokenMint);
      let tokenProgram: PublicKey;
      try {
        tokenProgram = await getTokenProgramIdForMint({ connection: rpcConn, mint: mintPk });
      } catch {
        tokenProgram = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
      }

      const treasuryAta = getAssociatedTokenAddress({ owner: treasuryPubkey, mint: mintPk, tokenProgram });
      const ataInfo = await rpcConn.getAccountInfo(treasuryAta, getServerCommitment());
      const rentForAta = ataInfo ? 0 : await rpcConn.getMinimumBalanceForRentExemption(165);

      const balance = await rpcConn.getBalance(treasuryPubkey, getServerCommitment());
      const bufferLamports = 50_000;
      const requiredLamports = Number(lamports) + rentForAta + bufferLamports;
      const missingLamports = Math.max(0, requiredLamports - balance);
      const latest = missingLamports > 0 ? await rpcConn.getLatestBlockhash("confirmed") : null;
      return { missingLamports, requiredLamports, balance, latest };
    });

    if (fundingPlan.missingLamports > 0) {
      const latest = fundingPlan.latest ?? (await connection.getLatestBlockhash("confirmed"));
      const tx = new Transaction();
      tx.feePayer = creatorPubkey;
      tx.recentBlockhash = latest.blockhash;
      tx.lastValidBlockHeight = latest.lastValidBlockHeight;
      tx.add(
        SystemProgram.transfer({
          fromPubkey: creatorPubkey,
          toPubkey: treasuryPubkey,
          lamports: fundingPlan.missingLamports,
        })
      );

      const txBytes = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
      const txBase64 = Buffer.from(Uint8Array.from(txBytes)).toString("base64");

      return NextResponse.json({
        ok: true,
        needsFunding: true,
        tokenMint,
        commitmentId,
        treasuryWallet: treasuryPubkey.toBase58(),
        currentLamports: fundingPlan.balance,
        requiredLamports: fundingPlan.requiredLamports,
        missingLamports: fundingPlan.missingLamports,
        txBase64,
        txFormat: "base64",
        txType: "fund_dev_wallet",
        blockhash: latest.blockhash,
        lastValidBlockHeight: latest.lastValidBlockHeight,
      });
    }

    const signature = await withRpcFallback(async (rpcConn) => {
      const mintPk = new PublicKey(tokenMint);

      const bondingCurveState = await getBondingCurveState({ connection: rpcConn, mint: mintPk });
      if (bondingCurveState.complete) {
        throw new Error("Bonding curve is complete");
      }

      const creatorKey = new PublicKey(bondingCurveState.creator);

      let tokenProgram: PublicKey;
      try {
        tokenProgram = await getTokenProgramIdForMint({ connection: rpcConn, mint: mintPk });
      } catch {
        tokenProgram = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
      }

      const virtualTokenReserves = BigInt(bondingCurveState.virtualTokenReserves);
      const virtualSolReserves = BigInt(bondingCurveState.virtualSolReserves);

      const feeBps = 100n;
      const feeLamports = (lamports * feeBps) / 10000n;
      const netSol = lamports > feeLamports ? lamports - feeLamports : 0n;
      const tokensOut = (netSol * virtualTokenReserves) / (virtualSolReserves + netSol);
      const tokensToBuy = (tokensOut * 90n) / 100n;
      const maxSolCost = lamports;

      const built = await buildUnsignedPumpfunBuyTxRegular({
        connection: rpcConn,
        user: treasuryPubkey,
        mint: mintPk,
        creator: creatorKey,
        tokenProgram,
        tokensToBuy,
        maxSolCost,
        trackVolume: false,
        computeUnitLimit: 300_000,
        computeUnitPriceMicroLamports: 100_000,
      });

      const txBase64 = built.tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");
      const signed = await privySignSolanaTransaction({
        walletId: privyWalletId,
        transactionBase64: txBase64,
      });

      const raw = Buffer.from(signed.signedTransactionBase64, "base64");
      const sig = await rpcConn.sendRawTransaction(raw, {
        skipPreflight: false,
        preflightCommitment: "processed",
        maxRetries: 3,
      });

      await confirmSignatureViaRpc(rpcConn, sig, getServerCommitment(), { timeoutMs: 60_000 });
      return sig;
    });

    let devBuyTokenAmount: string | null = null;
    try {
      const mintPk = new PublicKey(tokenMint);
      const treasuryAtaBalance = await withRpcFallback(async (rpcConn) => {
        const tokenProgram = await getTokenProgramIdForMint({ connection: rpcConn, mint: mintPk });
        const treasuryAta = getAssociatedTokenAddress({ owner: treasuryPubkey, mint: mintPk, tokenProgram });
        const bal = await withRetry(() => rpcConn.getTokenAccountBalance(treasuryAta, "confirmed"));
        return String(bal?.value?.amount ?? "0").trim();
      });

      const claimedRaw = String(commitment.devBuyTokensClaimed ?? "0").trim() || "0";
      const claimed = BigInt(claimedRaw);
      const total = BigInt(treasuryAtaBalance || "0") + claimed;
      if (total > 0n) {
        devBuyTokenAmount = total.toString();
        await updateDevBuyTokenAmount({ commitmentId, devBuyTokenAmount });
      }
    } catch {
      devBuyTokenAmount = null;
    }

    await auditLog("creator_dev_buy_ok", {
      creatorWallet,
      commitmentId,
      tokenMint,
      treasuryWallet: treasuryPubkey.toBase58(),
      lamports: lamports.toString(),
      txSig: signature,
      devBuyTokenAmount,
    });

    return NextResponse.json({
      ok: true,
      txSig: signature,
      tokenMint,
      lamports: lamports.toString(),
      treasuryWallet: treasuryPubkey.toBase58(),
      devBuyTokenAmount,
    });
  } catch (e) {
    const msg = getSafeErrorMessage(e);
    await auditLog("creator_dev_buy_error", { creatorWallet, error: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

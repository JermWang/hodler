import { NextResponse } from "next/server";
import { PublicKey, Transaction } from "@solana/web3.js";
import {
  createTransferInstruction,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";

import { checkRateLimit } from "../../../../lib/rateLimit";
import { auditLog } from "../../../../lib/auditLog";
import { getSafeErrorMessage } from "../../../../lib/safeError";
import { getConnection } from "../../../../lib/solana";
import { getCommitment, addDevBuyTokensClaim } from "../../../../lib/escrowStore";
import { privySignSolanaTransaction } from "../../../../lib/privy";
import { verifyCreatorAuthOrThrow } from "../../../../lib/creatorAuth";
import { sendAndConfirm } from "../../../../lib/rpc";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ wallet: string }> }) {
  const { wallet } = await params;
  const creatorWallet = String(wallet ?? "").trim();

  try {
    const rl = await checkRateLimit(req, { keyPrefix: `claim-dev-tokens:${creatorWallet}`, limit: 5, windowSeconds: 60 });
    if (!rl.allowed) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    }

    if (!creatorWallet) {
      return NextResponse.json({ error: "Wallet address required" }, { status: 400 });
    }

    let creatorPubkey: PublicKey;
    try {
      creatorPubkey = new PublicKey(creatorWallet);
    } catch {
      return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const commitmentId = typeof body?.commitmentId === "string" ? body.commitmentId.trim() : "";
    const percentageRaw = Number(body?.percentage ?? 100);
    const percentage = Math.max(1, Math.min(100, Math.floor(percentageRaw)));

    if (!commitmentId) {
      return NextResponse.json({ error: "commitmentId required" }, { status: 400 });
    }

    try {
      verifyCreatorAuthOrThrow({
        payload: body?.creatorAuth,
        action: "claim_dev_tokens",
        expectedWalletPubkey: creatorWallet,
        maxSkewSeconds: 5 * 60,
      });
    } catch (e) {
      const msg = (e as Error)?.message ?? String(e);
      await auditLog("claim_dev_tokens_auth_failed", { creatorWallet, commitmentId, error: msg });
      return NextResponse.json({ error: msg }, { status: 401 });
    }

    const commitment = await getCommitment(commitmentId);
    if (!commitment) {
      return NextResponse.json({ error: "Commitment not found" }, { status: 404 });
    }

    if (commitment.creatorPubkey !== creatorWallet) {
      await auditLog("claim_dev_tokens_unauthorized", { creatorWallet, commitmentId, expectedCreator: commitment.creatorPubkey });
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const totalTokens = BigInt(commitment.devBuyTokenAmount ?? "0");
    const alreadyClaimed = BigInt(commitment.devBuyTokensClaimed ?? "0");
    const remainingTokens = totalTokens - alreadyClaimed;

    if (remainingTokens <= 0n) {
      return NextResponse.json({
        error: "All dev buy tokens already claimed",
        txSigs: commitment.devBuyClaimTxSigs,
      }, { status: 409 });
    }

    if (!commitment.tokenMint) {
      return NextResponse.json({ error: "Token mint not found" }, { status: 400 });
    }

    const escrowSecretKey = commitment.escrowSecretKey;
    if (!escrowSecretKey?.startsWith("privy:")) {
      return NextResponse.json({ error: "Treasury wallet not managed by Privy" }, { status: 400 });
    }

    const privyWalletId = escrowSecretKey.slice("privy:".length);
    const treasuryPubkey = new PublicKey(commitment.escrowPubkey);
    const mintPubkey = new PublicKey(commitment.tokenMint);
    
    const claimAmount = percentage === 100 
      ? remainingTokens 
      : (remainingTokens * BigInt(percentage)) / 100n;
    
    if (claimAmount <= 0n) {
      return NextResponse.json({ error: "Claim amount too small" }, { status: 400 });
    }

    const connection = getConnection();

    const treasuryAta = getAssociatedTokenAddressSync(mintPubkey, treasuryPubkey, false, TOKEN_2022_PROGRAM_ID);
    const creatorAta = getAssociatedTokenAddressSync(mintPubkey, creatorPubkey, false, TOKEN_2022_PROGRAM_ID);

    const treasuryAtaInfo = await connection.getAccountInfo(treasuryAta);
    if (!treasuryAtaInfo) {
      return NextResponse.json({ error: "Treasury token account not found" }, { status: 400 });
    }

    const tx = new Transaction();
    tx.feePayer = treasuryPubkey;

    const creatorAtaInfo = await connection.getAccountInfo(creatorAta);
    if (!creatorAtaInfo) {
      tx.add(
        createAssociatedTokenAccountIdempotentInstruction(
          treasuryPubkey,
          creatorAta,
          creatorPubkey,
          mintPubkey,
          TOKEN_2022_PROGRAM_ID
        )
      );
    }

    tx.add(
      createTransferInstruction(
        treasuryAta,
        creatorAta,
        treasuryPubkey,
        claimAmount,
        [],
        TOKEN_2022_PROGRAM_ID
      )
    );

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    tx.lastValidBlockHeight = lastValidBlockHeight;

    const txBase64 = tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");

    const signed = await privySignSolanaTransaction({
      walletId: privyWalletId,
      transactionBase64: txBase64,
    });

    const raw = Buffer.from(signed.signedTransactionBase64, "base64");
    const signature = await connection.sendRawTransaction(raw, {
      skipPreflight: false,
      preflightCommitment: "confirmed",
      maxRetries: 3,
    });

    await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");

    await addDevBuyTokensClaim({ 
      commitmentId, 
      claimedAmount: claimAmount.toString(), 
      txSig: signature 
    });

    const newTotalClaimed = alreadyClaimed + claimAmount;
    const newRemaining = totalTokens - newTotalClaimed;

    await auditLog("claim_dev_tokens_success", {
      creatorWallet,
      commitmentId,
      tokenMint: commitment.tokenMint,
      claimedAmount: claimAmount.toString(),
      percentage,
      totalClaimed: newTotalClaimed.toString(),
      remaining: newRemaining.toString(),
      txSig: signature,
    });

    return NextResponse.json({
      ok: true,
      txSig: signature,
      claimedAmount: claimAmount.toString(),
      percentage,
      totalClaimed: newTotalClaimed.toString(),
      remaining: newRemaining.toString(),
      tokenMint: commitment.tokenMint,
    });
  } catch (e) {
    const msg = getSafeErrorMessage(e);
    await auditLog("claim_dev_tokens_error", { creatorWallet, error: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

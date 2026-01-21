import { NextResponse } from "next/server";
import { PublicKey, Transaction } from "@solana/web3.js";
import {
  createTransferInstruction,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";

import { checkRateLimit } from "../../../../lib/rateLimit";
import { auditLog } from "../../../../lib/auditLog";
import { getSafeErrorMessage } from "../../../../lib/safeError";
import { getConnection } from "../../../../lib/solana";
import {
  getCommitment,
  addDevBuyTokensClaim,
  bumpDevBuyTokensClaimedMin,
  updateDevBuyTokenAmount,
  tryAcquireDevBuyTokenClaimLock,
  releaseDevBuyTokenClaimLock,
} from "../../../../lib/escrowStore";
import { privySignSolanaTransaction } from "../../../../lib/privy";
import { verifyCreatorAuthOrThrow } from "../../../../lib/creatorAuth";
import { confirmSignatureViaRpc, getServerCommitment, withRetry } from "../../../../lib/rpc";
import { getTokenProgramIdForMint } from "../../../../lib/solana";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ wallet: string }> }) {
  const { wallet } = await params;
  const creatorWallet = String(wallet ?? "").trim();

  let lockAcquired = false;
  let lockedCommitmentId = "";

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

    const connection = getConnection();

    const tokenProgramId = await getTokenProgramIdForMint({ connection, mint: mintPubkey });

    const lock = await tryAcquireDevBuyTokenClaimLock({ commitmentId, createdAtUnix: Math.floor(Date.now() / 1000) });
    if (!lock.acquired) {
      await auditLog("claim_dev_tokens_lock_busy", {
        creatorWallet,
        commitmentId,
        existingCreatedAtUnix: lock.existingCreatedAtUnix,
      });
      const res = NextResponse.json({ error: "Claim already in progress. Please retry." }, { status: 409 });
      res.headers.set("retry-after", "5");
      return res;
    }
    lockAcquired = true;
    lockedCommitmentId = commitmentId;

    const treasuryAta = getAssociatedTokenAddressSync(mintPubkey, treasuryPubkey, false, tokenProgramId);
    const creatorAta = getAssociatedTokenAddressSync(mintPubkey, creatorPubkey, false, tokenProgramId);

    const treasuryAtaInfo = await connection.getAccountInfo(treasuryAta);
    if (!treasuryAtaInfo) {
      return NextResponse.json({ error: "Treasury token account not found" }, { status: 400 });
    }

    const chainTreasuryBalanceRaw = await withRetry(async () => {
      const bal = await connection.getTokenAccountBalance(treasuryAta, getServerCommitment());
      return String(bal?.value?.amount ?? "0").trim();
    });
    const chainTreasuryBalance = BigInt(chainTreasuryBalanceRaw || "0");

    const totalTokensDb = BigInt(String(commitment.devBuyTokenAmount ?? "0").trim() || "0");
    const alreadyClaimedDb = BigInt(String(commitment.devBuyTokensClaimed ?? "0").trim() || "0");

    const totalTokens = totalTokensDb > 0n ? totalTokensDb : chainTreasuryBalance + alreadyClaimedDb;

    if (totalTokensDb <= 0n && totalTokens > 0n) {
      await updateDevBuyTokenAmount({ commitmentId, devBuyTokenAmount: totalTokens.toString() });
    }

    const claimedOnChain = totalTokens > chainTreasuryBalance ? totalTokens - chainTreasuryBalance : 0n;
    if (claimedOnChain > alreadyClaimedDb) {
      await bumpDevBuyTokensClaimedMin({ commitmentId, minClaimedAmount: claimedOnChain.toString() });
    }

    const alreadyClaimed = claimedOnChain > alreadyClaimedDb ? claimedOnChain : alreadyClaimedDb;
    const remainingTokens = totalTokens - alreadyClaimed;

    if (remainingTokens <= 0n) {
      return NextResponse.json(
        {
          error: "All dev buy tokens already claimed",
          txSigs: commitment.devBuyClaimTxSigs,
        },
        { status: 409 }
      );
    }

    const targetClaimed = percentage === 100 ? totalTokens : (totalTokens * BigInt(percentage)) / 100n;
    const claimAmount = targetClaimed > alreadyClaimed ? targetClaimed - alreadyClaimed : 0n;

    if (claimAmount <= 0n) {
      return NextResponse.json({ error: "Nothing new to claim for this percentage" }, { status: 409 });
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
          tokenProgramId
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
        tokenProgramId
      )
    );

    const { blockhash, lastValidBlockHeight } = await withRetry(() => connection.getLatestBlockhash("processed"));
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
      preflightCommitment: "processed",
      maxRetries: 3,
    });

    await confirmSignatureViaRpc(connection, signature, getServerCommitment(), { timeoutMs: 60_000 });

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
  } finally {
    if (lockAcquired) {
      try {
        if (lockedCommitmentId) await releaseDevBuyTokenClaimLock({ commitmentId: lockedCommitmentId });
      } catch {
      }
    }
  }
}

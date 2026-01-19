import { NextRequest, NextResponse } from "next/server";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import crypto from "crypto";

import { getPool, hasDatabase } from "@/app/lib/db";
import { getClaimableRewards, recordRewardClaim } from "@/app/lib/epochSettlement";
import { getConnection, keypairFromBase58Secret } from "@/app/lib/solana";
import { confirmSignatureViaRpc, withRetry } from "@/app/lib/rpc";
import { verifyWalletSignature } from "@/app/lib/creatorAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AMPLIFI_PAYOUT_MIN_LAMPORTS = 10_000; // 0.00001 SOL minimum claim

/**
 * POST /api/holder/rewards/claim
 * 
 * Claim pending epoch rewards for a holder.
 * Requires wallet signature to prove ownership.
 * 
 * Body:
 * - walletPubkey: string
 * - epochIds: string[] (optional - claim specific epochs, or all if omitted)
 * - signature: string (base58)
 * - message: string (signed message)
 */
export async function POST(req: NextRequest) {
  try {
    if (!hasDatabase()) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    const body = await req.json().catch(() => ({}));
    const walletPubkey = String(body.walletPubkey ?? "").trim();
    const signature = String(body.signature ?? "").trim();
    const message = String(body.message ?? "").trim();
    const epochIds: string[] = Array.isArray(body.epochIds) ? body.epochIds.map(String) : [];

    if (!walletPubkey) {
      return NextResponse.json({ error: "walletPubkey required" }, { status: 400 });
    }

    // Validate wallet pubkey
    let recipientPubkey: PublicKey;
    try {
      recipientPubkey = new PublicKey(walletPubkey);
    } catch {
      return NextResponse.json({ error: "Invalid wallet pubkey" }, { status: 400 });
    }

    // Verify signature
    if (!signature || !message) {
      return NextResponse.json({ error: "Signature and message required" }, { status: 400 });
    }

    // Expected message format: "AmpliFi\nClaim Rewards\nWallet: {walletPubkey}\nTimestamp: {unix}"
    const messageLines = message.split("\n");
    if (messageLines[0] !== "AmpliFi" || messageLines[1] !== "Claim Rewards") {
      return NextResponse.json({ error: "Invalid message format" }, { status: 400 });
    }

    const walletLine = messageLines.find(l => l.startsWith("Wallet: "));
    const timestampLine = messageLines.find(l => l.startsWith("Timestamp: "));
    
    if (!walletLine || !timestampLine) {
      return NextResponse.json({ error: "Invalid message format" }, { status: 400 });
    }

    const messageWallet = walletLine.replace("Wallet: ", "");
    const messageTimestamp = parseInt(timestampLine.replace("Timestamp: ", ""), 10);

    if (messageWallet !== walletPubkey) {
      return NextResponse.json({ error: "Wallet mismatch in message" }, { status: 400 });
    }

    // Check timestamp is within 5 minutes
    const nowUnix = Math.floor(Date.now() / 1000);
    if (Math.abs(nowUnix - messageTimestamp) > 300) {
      return NextResponse.json({ error: "Message expired" }, { status: 400 });
    }

    // Verify the signature
    const isValid = verifyWalletSignature({
      message,
      signature,
      walletPubkey,
    });

    if (!isValid) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // Get claimable rewards
    const allRewards = await getClaimableRewards(walletPubkey);
    
    // Filter to unclaimed rewards
    let rewardsToClaim = allRewards.filter(r => !r.claimed && r.rewardLamports > 0n);
    
    // If specific epochs requested, filter to those
    if (epochIds.length > 0) {
      rewardsToClaim = rewardsToClaim.filter(r => epochIds.includes(r.epochId));
    }

    if (rewardsToClaim.length === 0) {
      return NextResponse.json({ error: "No claimable rewards" }, { status: 400 });
    }

    // Calculate total
    const totalLamports = rewardsToClaim.reduce((sum, r) => sum + r.rewardLamports, 0n);

    if (totalLamports < BigInt(AMPLIFI_PAYOUT_MIN_LAMPORTS)) {
      return NextResponse.json({ 
        error: `Minimum claim is ${AMPLIFI_PAYOUT_MIN_LAMPORTS / 1_000_000_000} SOL` 
      }, { status: 400 });
    }

    // Get payout wallet
    const payoutSecret = process.env.AMPLIFI_PAYOUT_SECRET_KEY || process.env.ESCROW_FEE_PAYER_SECRET_KEY;
    if (!payoutSecret) {
      return NextResponse.json({ 
        error: "Payout wallet not configured" 
      }, { status: 503 });
    }

    const payoutKeypair = keypairFromBase58Secret(payoutSecret);
    const connection = getConnection();

    // Check payout wallet balance
    const payoutBalance = await withRetry(() => 
      connection.getBalance(payoutKeypair.publicKey, "confirmed")
    );

    const totalLamportsNum = Number(totalLamports);
    const neededLamports = totalLamportsNum + 10_000; // Extra for fees

    if (payoutBalance < neededLamports) {
      console.error(`[Claim] Payout wallet insufficient: ${payoutBalance} < ${neededLamports}`);
      return NextResponse.json({ 
        error: "Payout temporarily unavailable, please try again later" 
      }, { status: 503 });
    }

    // Build and send transaction
    const { blockhash, lastValidBlockHeight } = await withRetry(() => 
      connection.getLatestBlockhash("confirmed")
    );

    const tx = new Transaction();
    tx.recentBlockhash = blockhash;
    tx.lastValidBlockHeight = lastValidBlockHeight;
    tx.feePayer = payoutKeypair.publicKey;

    tx.add(
      SystemProgram.transfer({
        fromPubkey: payoutKeypair.publicKey,
        toPubkey: recipientPubkey,
        lamports: totalLamportsNum,
      })
    );

    tx.sign(payoutKeypair);

    const txSig = await withRetry(() =>
      connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
        maxRetries: 3,
      })
    );

    // Wait for confirmation
    await confirmSignatureViaRpc(connection, txSig, "confirmed");

    // Record claims in database
    const pool = getPool();
    const claimResults: Array<{ epochId: string; amount: string; success: boolean }> = [];

    for (const reward of rewardsToClaim) {
      try {
        await recordRewardClaim({
          epochId: reward.epochId,
          walletPubkey,
          amountLamports: reward.rewardLamports,
          txSig,
        });

        claimResults.push({
          epochId: reward.epochId,
          amount: reward.rewardLamports.toString(),
          success: true,
        });
      } catch (e) {
        console.error(`[Claim] Failed to record claim for epoch ${reward.epochId}:`, e);
        claimResults.push({
          epochId: reward.epochId,
          amount: reward.rewardLamports.toString(),
          success: false,
        });
      }
    }

    // Log to audit
    const auditId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO public.amplifi_audit_log 
       (id, action, wallet_pubkey, details, tx_sig, amount_lamports, created_at_unix)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        auditId,
        "reward_claimed",
        walletPubkey,
        JSON.stringify({ 
          epochsClaimed: rewardsToClaim.map(r => r.epochId),
          campaigns: [...new Set(rewardsToClaim.map(r => r.campaignId))],
        }),
        txSig,
        totalLamports.toString(),
        nowUnix,
      ]
    );

    // Log to payout transactions
    const payoutId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO public.payout_transactions 
       (id, payout_type, recipient_pubkey, amount_lamports, tx_sig, status, created_at_unix, confirmed_at_unix)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        payoutId,
        "epoch_reward",
        walletPubkey,
        totalLamports.toString(),
        txSig,
        "confirmed",
        nowUnix,
        nowUnix,
      ]
    );

    return NextResponse.json({
      success: true,
      txSig,
      totalLamports: totalLamports.toString(),
      totalSol: (Number(totalLamports) / 1_000_000_000).toFixed(9),
      epochsClaimed: claimResults.length,
      claims: claimResults,
    });
  } catch (error) {
    console.error("[Claim] Error:", error);
    return NextResponse.json(
      { error: "Failed to process claim", details: String(error) },
      { status: 500 }
    );
  }
}

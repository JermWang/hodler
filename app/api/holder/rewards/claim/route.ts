import { NextRequest, NextResponse } from "next/server";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import bs58 from "bs58";
import crypto from "crypto";

import { getPool, hasDatabase } from "@/app/lib/db";
import { getClaimableRewards, recordRewardClaim } from "@/app/lib/epochSettlement";
import { getConnection, keypairFromBase58Secret } from "@/app/lib/solana";
import { confirmSignatureViaRpc, withRetry } from "@/app/lib/rpc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AMPLIFI_PAYOUT_MIN_LAMPORTS = 10_000; // 0.00001 SOL minimum claim

/**
 * GET /api/holder/rewards/claim?wallet=...&epochIds=...
 * 
 * Step 1: Get a partially signed transaction for claiming rewards.
 * The payout wallet signs the transfer, user must sign as fee payer.
 * 
 * Returns: { transaction: base64, totalLamports, epochIds }
 */
export async function GET(req: NextRequest) {
  try {
    if (!hasDatabase()) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    const { searchParams } = new URL(req.url);
    const walletPubkey = searchParams.get("wallet")?.trim() ?? "";
    const epochIdsParam = searchParams.get("epochIds")?.trim() ?? "";
    const epochIds = epochIdsParam ? epochIdsParam.split(",").map(s => s.trim()).filter(Boolean) : [];

    if (!walletPubkey) {
      return NextResponse.json({ error: "wallet required" }, { status: 400 });
    }

    // Validate wallet pubkey
    let recipientPubkey: PublicKey;
    try {
      recipientPubkey = new PublicKey(walletPubkey);
    } catch {
      return NextResponse.json({ error: "Invalid wallet pubkey" }, { status: 400 });
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
      return NextResponse.json({ error: "Payout wallet not configured" }, { status: 503 });
    }

    const payoutKeypair = keypairFromBase58Secret(payoutSecret);
    const connection = getConnection();

    // Check payout wallet balance (just needs enough for the transfer, not fees)
    const payoutBalance = await withRetry(() => 
      connection.getBalance(payoutKeypair.publicKey, "confirmed")
    );

    const totalLamportsNum = Number(totalLamports);

    if (payoutBalance < totalLamportsNum) {
      console.error(`[Claim] Payout wallet insufficient: ${payoutBalance} < ${totalLamportsNum}`);
      return NextResponse.json({ 
        error: "Payout temporarily unavailable, please try again later" 
      }, { status: 503 });
    }

    // Build transaction - USER pays fees
    const { blockhash, lastValidBlockHeight } = await withRetry(() => 
      connection.getLatestBlockhash("confirmed")
    );

    const tx = new Transaction();
    tx.recentBlockhash = blockhash;
    tx.lastValidBlockHeight = lastValidBlockHeight;
    tx.feePayer = recipientPubkey; // USER pays gas

    tx.add(
      SystemProgram.transfer({
        fromPubkey: payoutKeypair.publicKey,
        toPubkey: recipientPubkey,
        lamports: totalLamportsNum,
      })
    );

    // Payout wallet signs the transfer (partial sign)
    tx.partialSign(payoutKeypair);

    // Serialize for user to sign
    const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
    const transactionBase64 = Buffer.from(serialized).toString("base64");

    return NextResponse.json({
      transaction: transactionBase64,
      totalLamports: totalLamports.toString(),
      totalSol: (totalLamportsNum / 1_000_000_000).toFixed(9),
      epochIds: rewardsToClaim.map(r => r.epochId),
      blockhash,
      lastValidBlockHeight,
      message: "Sign this transaction to claim your rewards. You pay the gas fee (~0.000005 SOL).",
    });
  } catch (error) {
    console.error("[Claim GET] Error:", error);
    return NextResponse.json(
      { error: "Failed to prepare claim", details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/holder/rewards/claim
 * 
 * Step 2: Submit the fully signed transaction.
 * User has signed the transaction returned from GET.
 * 
 * Body:
 * - signedTransaction: base64 (fully signed transaction)
 * - walletPubkey: string
 * - epochIds: string[]
 */
export async function POST(req: NextRequest) {
  try {
    if (!hasDatabase()) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    const body = await req.json().catch(() => ({}));
    const signedTransactionBase64 = String(body.signedTransaction ?? "").trim();
    const walletPubkey = String(body.walletPubkey ?? "").trim();
    const epochIds: string[] = Array.isArray(body.epochIds) ? body.epochIds.map(String) : [];

    if (!signedTransactionBase64) {
      return NextResponse.json({ error: "signedTransaction required" }, { status: 400 });
    }
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

    // Get payout wallet pubkey for validation
    const payoutSecret = process.env.AMPLIFI_PAYOUT_SECRET_KEY || process.env.ESCROW_FEE_PAYER_SECRET_KEY;
    if (!payoutSecret) {
      return NextResponse.json({ error: "Payout wallet not configured" }, { status: 503 });
    }
    const payoutKeypair = keypairFromBase58Secret(payoutSecret);

    // Deserialize and validate transaction
    let tx: Transaction;
    try {
      const txBytes = Buffer.from(signedTransactionBase64, "base64");
      tx = Transaction.from(txBytes);
    } catch {
      return NextResponse.json({ error: "Invalid transaction format" }, { status: 400 });
    }

    // Validate transaction structure
    if (!tx.feePayer || tx.feePayer.toBase58() !== recipientPubkey.toBase58()) {
      return NextResponse.json({ error: "Invalid fee payer" }, { status: 400 });
    }

    // Validate the transfer instruction
    if (tx.instructions.length !== 1) {
      return NextResponse.json({ error: "Invalid transaction structure" }, { status: 400 });
    }

    const ix = tx.instructions[0];
    if (!ix.programId.equals(SystemProgram.programId)) {
      return NextResponse.json({ error: "Invalid instruction program" }, { status: 400 });
    }

    // Verify transfer is from payout wallet to claimer
    const fromKey = ix.keys.find(k => k.isSigner && k.isWritable);
    const toKey = ix.keys.find(k => !k.isSigner && k.isWritable);
    
    if (!fromKey || fromKey.pubkey.toBase58() !== payoutKeypair.publicKey.toBase58()) {
      return NextResponse.json({ error: "Invalid transfer source" }, { status: 400 });
    }
    if (!toKey || toKey.pubkey.toBase58() !== recipientPubkey.toBase58()) {
      return NextResponse.json({ error: "Invalid transfer destination" }, { status: 400 });
    }

    // Get the rewards to verify amount
    const allRewards = await getClaimableRewards(walletPubkey);
    let rewardsToClaim = allRewards.filter(r => !r.claimed && r.rewardLamports > 0n);
    
    if (epochIds.length > 0) {
      rewardsToClaim = rewardsToClaim.filter(r => epochIds.includes(r.epochId));
    }

    if (rewardsToClaim.length === 0) {
      return NextResponse.json({ error: "No claimable rewards" }, { status: 400 });
    }

    const totalLamports = rewardsToClaim.reduce((sum, r) => sum + r.rewardLamports, 0n);

    // Send the transaction
    const connection = getConnection();
    
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
    const nowUnix = Math.floor(Date.now() / 1000);
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
    console.error("[Claim POST] Error:", error);
    return NextResponse.json(
      { error: "Failed to process claim", details: String(error) },
      { status: 500 }
    );
  }
}

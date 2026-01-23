import { NextRequest, NextResponse } from "next/server";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { Buffer } from "buffer";
import bs58 from "bs58";
import crypto from "crypto";
import nacl from "tweetnacl";

import { getPool, hasDatabase } from "@/app/lib/db";
import { getClaimableRewards } from "@/app/lib/epochSettlement";
import {
  getConnection,
  keypairFromBase58Secret,
  getAssociatedTokenAddress,
  buildCreateAssociatedTokenAccountIdempotentInstruction,
  buildSplTokenTransferInstruction,
  getTokenProgramIdForMint,
  getTokenBalanceForMint,
} from "@/app/lib/solana";
import { confirmSignatureViaRpc, withRetry } from "@/app/lib/rpc";
import { getCampaignEscrowWallet, signWithCampaignEscrow } from "@/app/lib/campaignEscrow";
import { getVerifiedStatusForTwitterUserIds } from "@/app/lib/twitterInfluenceStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AMPLIFI_PAYOUT_MIN_LAMPORTS = 10_000; // 0.00001 SOL minimum claim
const AMPLIFI_SPL_MIN_AMOUNT = BigInt(1); // Minimum 1 raw unit for SPL claims
const AMPLIFI_WALLET_RESERVE_LAMPORTS = 20_000_000; // 0.02 SOL minimum reserve for tx fees

const COMPUTE_BUDGET_PROGRAM_ID = new PublicKey("ComputeBudget111111111111111111111111111111");

function stripComputeBudgetInstructions(tx: Transaction): Transaction {
  const out = new Transaction();
  out.recentBlockhash = tx.recentBlockhash;
  out.lastValidBlockHeight = tx.lastValidBlockHeight;
  out.feePayer = tx.feePayer ?? undefined;
  for (const ix of tx.instructions) {
    if (ix.programId.equals(COMPUTE_BUDGET_PROGRAM_ID)) continue;
    out.add(ix);
  }
  return out;
}

function getPendingClaimTtlSeconds(): number {
  const raw = Number(process.env.AMPLIFI_REWARD_CLAIM_TTL_SECONDS ?? "");
  if (Number.isFinite(raw) && raw > 0) return Math.floor(raw);
  return 5 * 60;
}

function requireSafeLamportsNumber(totalLamports: bigint): number {
  if (totalLamports <= 0n) return 0;
  const max = BigInt(Number.MAX_SAFE_INTEGER);
  if (totalLamports > max) {
    throw new Error("Claim amount too large");
  }
  return Number(totalLamports);
}

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

    void epochIds;

    if (!walletPubkey) {
      return NextResponse.json({ error: "wallet required" }, { status: 400 });
    }

    // Validate wallet pubkey
    let recipientPubkey: PublicKey;
    try {
      recipientPubkey = new PublicKey(walletPubkey);
    } catch {
      return NextResponse.json({ 
        error: "Invalid wallet address",
        hint: "Please reconnect your wallet and try again."
      }, { status: 400 });
    }

    // Get claimable rewards
    const allRewards = await getClaimableRewards(walletPubkey);
    
    // Filter to unclaimed rewards
    let rewardsToClaim = allRewards.filter(r => !r.claimed && r.rewardLamports > 0n);

    const pool = getPool();

    // Require verified X account at claim time
    const regRes = await pool.query(
      `select twitter_user_id
       from public.holder_registrations
       where wallet_pubkey=$1 and status='active'
       limit 1`,
      [walletPubkey]
    );
    const twitterUserId = String(regRes.rows?.[0]?.twitter_user_id ?? "").trim();
    if (!twitterUserId) {
      return NextResponse.json(
        { error: "Twitter account not verified. Please connect your Twitter first." },
        { status: 400 }
      );
    }

    const bearerToken = process.env.TWITTER_BEARER_TOKEN;
    if (!bearerToken) {
      return NextResponse.json(
        { error: "Twitter API not configured" },
        { status: 503 }
      );
    }

    // Prefer cache to avoid false negatives when we cannot call Twitter
    let isVerified = false;
    try {
      const cacheRes = await pool.query(
        `select verified
         from public.twitter_user_influence_cache
         where twitter_user_id = $1
         limit 1`,
        [twitterUserId]
      );
      const cachedVerified = cacheRes.rows?.[0]?.verified;
      if (cachedVerified === false) {
        return NextResponse.json(
          { error: "X account must be verified to claim rewards" },
          { status: 403 }
        );
      }
      if (cachedVerified === true) {
        isVerified = true;
      }
    } catch {
    }

    if (!isVerified) {
      const verifiedMap = await getVerifiedStatusForTwitterUserIds({
        twitterUserIds: [twitterUserId],
        bearerToken,
      });
      isVerified = verifiedMap.get(twitterUserId) ?? false;
    }
    if (!isVerified) {
      try {
        const cacheRes = await pool.query(
          `select verified
           from public.twitter_user_influence_cache
           where twitter_user_id = $1
           limit 1`,
          [twitterUserId]
        );
        const cachedVerified = cacheRes.rows?.[0]?.verified;
        if (cachedVerified === false) {
          return NextResponse.json(
            { error: "X account must be verified to claim rewards" },
            { status: 403 }
          );
        }
      } catch {
      }

      return NextResponse.json(
        { error: "Unable to verify X account right now. Please try again soon." },
        { status: 503 }
      );
    }
    const nowUnix = Math.floor(Date.now() / 1000);
    const ttlSeconds = getPendingClaimTtlSeconds();
    const pendingRes = await pool.query(
      `select tx_sig, max(claimed_at_unix) as claimed_at_unix
       from public.reward_claims
       where wallet_pubkey=$1
         and status='pending'
         and claimed_at_unix is not null
       group by tx_sig
       order by claimed_at_unix desc
       limit 1`,
      [walletPubkey]
    );

    const pendingRow = pendingRes.rows?.[0] ?? null;
    if (pendingRow) {
      const claimedAt = Number(pendingRow?.claimed_at_unix);
      const pendingTxSig = String(pendingRow?.tx_sig ?? "").trim();

      if (Number.isFinite(claimedAt) && claimedAt > 0 && nowUnix - claimedAt <= ttlSeconds) {
        return NextResponse.json(
          { error: "Found pending reward claims", hint: "A claim is already in progress. Wait a moment and try again." },
          { status: 409 }
        );
      }

      if (pendingTxSig) {
        const connection = getConnection();
        const st = await withRetry(() => connection.getSignatureStatuses([pendingTxSig], { searchTransactionHistory: true }));
        const s = (st?.value?.[0] as any) ?? null;
        const cs = String(s?.confirmationStatus ?? "");
        const confirmed = !s?.err && (cs === "confirmed" || cs === "finalized");
        const hasAnyStatus = Boolean(s?.confirmationStatus) || s?.err != null;

        if (confirmed) {
          await pool.query(
            `update public.reward_claims
             set status='completed'
             where wallet_pubkey=$1
               and status='pending'
               and tx_sig=$2`,
            [walletPubkey, pendingTxSig]
          );
          return NextResponse.json({ ok: true, alreadyConfirmed: true, txSig: pendingTxSig });
        }

        if (s?.err) {
          await pool.query(
            `delete from public.reward_claims
             where wallet_pubkey=$1
               and status='pending'
               and tx_sig=$2`,
            [walletPubkey, pendingTxSig]
          );
        } else if (hasAnyStatus) {
          return NextResponse.json(
            { error: "Found pending reward claims", hint: "A claim is already in progress. Wait a moment and try again." },
            { status: 409 }
          );
        } else if (Number.isFinite(claimedAt) && claimedAt > 0 && nowUnix - claimedAt < 60 * 60) {
          return NextResponse.json(
            { error: "Found pending reward claims", hint: "A claim is already in progress. Wait a moment and try again." },
            { status: 409 }
          );
        } else {
          await pool.query(
            `delete from public.reward_claims
             where wallet_pubkey=$1
               and status='pending'
               and tx_sig=$2`,
            [walletPubkey, pendingTxSig]
          );
        }
      } else {
        if (Number.isFinite(claimedAt) && claimedAt > 0 && nowUnix - claimedAt < 60 * 60) {
          return NextResponse.json(
            { error: "Found pending reward claims", hint: "A claim is already in progress. Wait a moment and try again." },
            { status: 409 }
          );
        }
        await pool.query(
          `delete from public.reward_claims
           where wallet_pubkey=$1
             and status='pending'
             and (tx_sig is null or tx_sig='')`,
          [walletPubkey]
        );
      }
    }

    if (rewardsToClaim.length === 0) {
      return NextResponse.json({ 
        error: "No rewards available to claim",
        hint: "You may have already claimed your rewards, or you haven't earned any yet. Check your dashboard for details."
      }, { status: 400 });
    }

    // Group rewards by asset type
    const solRewards = rewardsToClaim.filter(r => r.rewardAssetType === "sol");
    const splRewards = rewardsToClaim.filter(r => r.rewardAssetType === "spl" && r.rewardMint);

    // For now, we only process one type at a time. Prefer SOL if both exist.
    const isSplClaim = solRewards.length === 0 && splRewards.length > 0;
    const activeRewards = isSplClaim ? splRewards : solRewards;

    // Enforce token holding requirement at claim time for each campaign being claimed
    const campaignIds = [...new Set(activeRewards.map((r) => String(r.campaignId)))].filter(Boolean);
    if (campaignIds.length > 0) {
      const campaignsRes = await pool.query(
        `select id, token_mint, min_token_balance
         from public.campaigns
         where id = any($1::text[])`,
        [campaignIds]
      );
      const byId = new Map<string, { tokenMint: string; minTokenBalance: bigint }>();
      for (const row of campaignsRes.rows ?? []) {
        const id = String(row.id);
        const tokenMint = String(row.token_mint ?? "").trim();
        const minTokenBalance = BigInt(String(row.min_token_balance ?? "0"));
        if (id && tokenMint) byId.set(id, { tokenMint, minTokenBalance });
      }

      const connection = getConnection();
      for (const campaignId of campaignIds) {
        const c = byId.get(campaignId);
        if (!c) {
          return NextResponse.json(
            { error: "Campaign configuration not found for claim" },
            { status: 500 }
          );
        }

        const minRequired = c.minTokenBalance > 0n ? c.minTokenBalance : 1n;
        let current = 0n;
        try {
          const mintPk = new PublicKey(c.tokenMint);
          current = (await getTokenBalanceForMint({ connection, owner: recipientPubkey, mint: mintPk })).amountRaw;
        } catch {
          return NextResponse.json(
            { error: "Failed to verify token balance" },
            { status: 503 }
          );
        }

        if (current < minRequired) {
          return NextResponse.json(
            {
              error: "Must be holding the token to claim rewards",
              campaignId,
              tokenMint: c.tokenMint,
              minRequired: minRequired.toString(),
              current: current.toString(),
            },
            { status: 403 }
          );
        }
      }
    }

    const manualRewards = activeRewards.filter((r) => r.isManualLockup);
    const isManualClaim = manualRewards.length > 0;
    if (isManualClaim && manualRewards.length !== activeRewards.length) {
      return NextResponse.json(
        { error: "Cannot claim manual-lockup rewards together with non-manual rewards" },
        { status: 400 }
      );
    }

    // For SPL claims, all rewards must have the same mint
    let splMint: string | null = null;
    if (isSplClaim) {
      const mints = [...new Set(splRewards.map(r => r.rewardMint))];
      if (mints.length > 1) {
        return NextResponse.json({ 
          error: "Multiple SPL token types in rewards. Please claim one token type at a time.",
          mints,
        }, { status: 400 });
      }
      splMint = mints[0];
    }

    // Calculate total
    const totalLamports = activeRewards.reduce((sum, r) => sum + r.rewardLamports, 0n);

    if (!isSplClaim && totalLamports < BigInt(AMPLIFI_PAYOUT_MIN_LAMPORTS)) {
      return NextResponse.json({ 
        error: `Minimum claim is ${AMPLIFI_PAYOUT_MIN_LAMPORTS / 1_000_000_000} SOL` 
      }, { status: 400 });
    }

    if (isSplClaim && totalLamports < AMPLIFI_SPL_MIN_AMOUNT) {
      return NextResponse.json({ error: "No claimable SPL rewards" }, { status: 400 });
    }

    const connection = getConnection();

    // Build transaction - USER pays fees
    const { blockhash, lastValidBlockHeight } = await withRetry(() => 
      connection.getLatestBlockhash("confirmed")
    );

    const tx = new Transaction();
    tx.recentBlockhash = blockhash;
    tx.lastValidBlockHeight = lastValidBlockHeight;
    tx.feePayer = recipientPubkey; // USER pays gas

    if (isSplClaim && splMint) {
      if (!isManualClaim) {
        return NextResponse.json(
          { error: "SPL rewards are only supported for manual-lockup campaigns" },
          { status: 400 }
        );
      }
      // SPL Token Transfer - uses campaign's escrow wallet (Privy-managed)
      // All SPL rewards in this claim must be from the same campaign
      const campaignIds = [...new Set(activeRewards.map(r => r.campaignId))];
      if (campaignIds.length > 1) {
        return NextResponse.json({
          error: "SPL rewards from multiple campaigns cannot be claimed together. Please claim one campaign at a time.",
          campaigns: campaignIds,
        }, { status: 400 });
      }

      const campaignId = campaignIds[0];
      const escrowWallet = await getCampaignEscrowWallet(campaignId);
      if (!escrowWallet) {
        return NextResponse.json({
          error: "Campaign escrow wallet not found. The campaign may not be properly configured for SPL rewards.",
        }, { status: 400 });
      }

      const escrowPubkey = new PublicKey(escrowWallet.walletPubkey);
      const mintPubkey = new PublicKey(splMint);
      const tokenProgram = await getTokenProgramIdForMint({ connection, mint: mintPubkey });
      
      const sourceAta = getAssociatedTokenAddress({ owner: escrowPubkey, mint: mintPubkey, tokenProgram });
      const { ix: createAtaIx, ata: destinationAta } = buildCreateAssociatedTokenAccountIdempotentInstruction({
        payer: recipientPubkey,
        owner: recipientPubkey,
        mint: mintPubkey,
        tokenProgram,
      });
      const transferIx = buildSplTokenTransferInstruction({
        sourceAta,
        destinationAta,
        owner: escrowPubkey,
        amountRaw: totalLamports,
        tokenProgram,
      });

      tx.add(createAtaIx);
      tx.add(transferIx);

      // For SPL claims, we use Privy to sign (escrow wallet is Privy-managed)
      // Sign with Privy and return the fully signed transaction
      const { signedTransactionBase64 } = await signWithCampaignEscrow({
        campaignId,
        transaction: tx,
      });

      const rewardDecimals = activeRewards[0]?.rewardDecimals ?? 6;
      const divisor = 10 ** rewardDecimals;

      return NextResponse.json({
        transaction: signedTransactionBase64,
        totalLamports: totalLamports.toString(),
        totalAmount: (Number(totalLamports) / divisor).toFixed(rewardDecimals > 6 ? 9 : 6),
        epochIds: activeRewards.map(r => r.epochId),
        blockhash,
        lastValidBlockHeight,
        rewardAssetType: "spl",
        rewardMint: splMint,
        campaignId,
        escrowWallet: escrowWallet.walletPubkey,
        message: "Sign this transaction to claim your token rewards. You pay the gas fee (~0.000005 SOL).",
      });
    } else {
      if (isManualClaim) {
        // Manual-lockup SOL claim - must come from the campaign escrow wallet
        const campaignIds = [...new Set(activeRewards.map((r) => r.campaignId))];
        if (campaignIds.length !== 1) {
          return NextResponse.json(
            { error: "Manual-lockup rewards from multiple campaigns cannot be claimed together" },
            { status: 400 }
          );
        }

        const campaignId = campaignIds[0];
        const escrowWallet = await getCampaignEscrowWallet(campaignId);
        if (!escrowWallet) {
          return NextResponse.json(
            { error: "Campaign escrow wallet not found" },
            { status: 400 }
          );
        }

        const escrowPubkey = new PublicKey(escrowWallet.walletPubkey);
        const totalLamportsNum = requireSafeLamportsNumber(totalLamports);
        const escrowBalance = await withRetry(() => connection.getBalance(escrowPubkey, "confirmed"));
        const requiredWithReserve = totalLamportsNum + AMPLIFI_WALLET_RESERVE_LAMPORTS;
        if (escrowBalance < requiredWithReserve) {
          return NextResponse.json(
            { 
              error: "Reward pool is currently being replenished",
              hint: "The campaign's reward pool needs to be topped up. This usually resolves within a few hours. Please try again later or contact the project team."
            },
            { status: 503 }
          );
        }

        tx.add(
          SystemProgram.transfer({
            fromPubkey: escrowPubkey,
            toPubkey: recipientPubkey,
            lamports: totalLamportsNum,
          })
        );

        const { signedTransactionBase64 } = await signWithCampaignEscrow({ campaignId, transaction: tx });
        return NextResponse.json({
          transaction: signedTransactionBase64,
          totalLamports: totalLamports.toString(),
          totalSol: (totalLamportsNum / 1_000_000_000).toFixed(9),
          epochIds: activeRewards.map((r) => r.epochId),
          blockhash,
          lastValidBlockHeight,
          rewardAssetType: "sol",
          rewardMint: null,
          campaignId,
          escrowWallet: escrowWallet.walletPubkey,
          message: "Sign this transaction to claim your rewards. You pay the gas fee (~0.000005 SOL).",
        });
      }

      // Get payout wallet (SOL only)
      const payoutSecret = process.env.AMPLIFI_PAYOUT_SECRET_KEY || process.env.ESCROW_FEE_PAYER_SECRET_KEY;
      if (!payoutSecret) {
        return NextResponse.json({ 
        error: "Payout system temporarily unavailable",
        hint: "Our team has been notified. Please try again in a few minutes."
      }, { status: 503 });
      }

      const payoutKeypair = keypairFromBase58Secret(payoutSecret);

      // SOL Transfer
      const totalLamportsNum = requireSafeLamportsNumber(totalLamports);

      // Check payout wallet balance (must keep 0.02 SOL reserve for tx fees)
      const payoutBalance = await withRetry(() => 
        connection.getBalance(payoutKeypair.publicKey, "confirmed")
      );

      const requiredWithReserve = totalLamportsNum + AMPLIFI_WALLET_RESERVE_LAMPORTS;
      if (payoutBalance < requiredWithReserve) {
        console.error(`[Claim] Payout wallet insufficient: ${payoutBalance} < ${requiredWithReserve} (includes 0.02 SOL reserve)`);
        return NextResponse.json({ 
          error: "Reward pool is currently being replenished",
          hint: "High claim volume has temporarily depleted the payout pool. It will be automatically refilled shortly. Please try again in 15-30 minutes."
        }, { status: 503 });
      }

      tx.add(
        SystemProgram.transfer({
          fromPubkey: payoutKeypair.publicKey,
          toPubkey: recipientPubkey,
          lamports: totalLamportsNum,
        })
      );

      // Payout wallet signs the transfer (partial sign)
      tx.partialSign(payoutKeypair);
    }

    // Serialize for user to sign
    const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
    const transactionBase64 = Buffer.from(Uint8Array.from(serialized)).toString("base64");

    const rewardDecimals = isSplClaim ? (activeRewards[0]?.rewardDecimals ?? 6) : 9;
    const divisor = 10 ** rewardDecimals;

    return NextResponse.json({
      transaction: transactionBase64,
      totalLamports: totalLamports.toString(),
      totalAmount: (Number(totalLamports) / divisor).toFixed(rewardDecimals > 6 ? 9 : 6),
      totalSol: isSplClaim ? undefined : (Number(totalLamports) / 1_000_000_000).toFixed(9),
      epochIds: activeRewards.map(r => r.epochId),
      blockhash,
      lastValidBlockHeight,
      rewardAssetType: isSplClaim ? "spl" : "sol",
      rewardMint: splMint,
      message: isSplClaim 
        ? "Sign this transaction to claim your token rewards. You pay the gas fee (~0.000005 SOL)."
        : "Sign this transaction to claim your rewards. You pay the gas fee (~0.000005 SOL).",
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

    void epochIds;

    // Validate wallet pubkey
    let recipientPubkey: PublicKey;
    try {
      recipientPubkey = new PublicKey(walletPubkey);
    } catch {
      return NextResponse.json({ 
        error: "Invalid wallet address",
        hint: "Please reconnect your wallet and try again."
      }, { status: 400 });
    }

    const connection = getConnection();

    // Deserialize and validate transaction
    let tx: Transaction;
    try {
      const txBytes = Buffer.from(signedTransactionBase64, "base64");
      tx = Transaction.from(txBytes);
    } catch {
      return NextResponse.json({ error: "Invalid transaction format" }, { status: 400 });
    }

    const feePayerStr = tx.feePayer?.toBase58?.() ?? "";
    if (feePayerStr !== recipientPubkey.toBase58()) {
      return NextResponse.json({ error: "Invalid fee payer" }, { status: 400 });
    }

    const userSigEntry = tx.signatures.find((s) => s.publicKey.equals(recipientPubkey));
    const userSigBytes = userSigEntry?.signature ?? null;
    if (!userSigBytes) {
      return NextResponse.json({ error: "Missing user signature" }, { status: 400 });
    }
    const msg = tx.serializeMessage();
    const sigOk = nacl.sign.detached.verify(Uint8Array.from(msg), Uint8Array.from(userSigBytes), recipientPubkey.toBytes());
    if (!sigOk) {
      return NextResponse.json({ error: "Invalid transaction signature" }, { status: 401 });
    }

    const txSig = bs58.encode(userSigBytes);

    const pool = getPool();
    const nowUnix = Math.floor(Date.now() / 1000);
    const ttlSeconds = getPendingClaimTtlSeconds();
    const staleBefore = nowUnix - ttlSeconds;

    // Require verified X account at claim time
    const regRes = await pool.query(
      `select twitter_user_id
       from public.holder_registrations
       where wallet_pubkey=$1 and status='active'
       limit 1`,
      [walletPubkey]
    );
    const twitterUserId = String(regRes.rows?.[0]?.twitter_user_id ?? "").trim();
    if (!twitterUserId) {
      return NextResponse.json(
        { error: "Twitter account not verified. Please connect your Twitter first." },
        { status: 400 }
      );
    }

    const bearerToken = process.env.TWITTER_BEARER_TOKEN;
    if (!bearerToken) {
      return NextResponse.json(
        { error: "Twitter API not configured" },
        { status: 503 }
      );
    }

    let isVerified = false;
    try {
      const cacheRes = await pool.query(
        `select verified
         from public.twitter_user_influence_cache
         where twitter_user_id = $1
         limit 1`,
        [twitterUserId]
      );
      const cachedVerified = cacheRes.rows?.[0]?.verified;
      if (cachedVerified === false) {
        return NextResponse.json(
          { error: "X account must be verified to claim rewards" },
          { status: 403 }
        );
      }
      if (cachedVerified === true) {
        isVerified = true;
      }
    } catch {
    }

    if (!isVerified) {
      const verifiedMap = await getVerifiedStatusForTwitterUserIds({
        twitterUserIds: [twitterUserId],
        bearerToken,
      });
      isVerified = verifiedMap.get(twitterUserId) ?? false;
    }

    if (!isVerified) {
      try {
        const cacheRes = await pool.query(
          `select verified
           from public.twitter_user_influence_cache
           where twitter_user_id = $1
           limit 1`,
          [twitterUserId]
        );
        const cachedVerified = cacheRes.rows?.[0]?.verified;
        if (cachedVerified === false) {
          return NextResponse.json(
            { error: "X account must be verified to claim rewards" },
            { status: 403 }
          );
        }
      } catch {
      }

      return NextResponse.json(
        { error: "Unable to verify X account right now. Please try again soon." },
        { status: 503 }
      );
    }

    const allRewards = await getClaimableRewards(walletPubkey);
    const allRewardsToClaim = allRewards.filter((r) => !r.claimed && r.rewardLamports > 0n);

    // Group rewards by asset type (same logic as GET)
    const solRewards = allRewardsToClaim.filter(r => r.rewardAssetType === "sol");
    const splRewards = allRewardsToClaim.filter(r => r.rewardAssetType === "spl" && r.rewardMint);
    const isSplClaim = solRewards.length === 0 && splRewards.length > 0;
    const rewardsToClaim = isSplClaim ? splRewards : solRewards;

    // Enforce token holding requirement at claim time for each campaign being claimed
    const claimCampaignIds = [...new Set(rewardsToClaim.map((r) => String(r.campaignId)))].filter(Boolean);
    if (claimCampaignIds.length > 0) {
      const campaignsRes = await pool.query(
        `select id, token_mint, min_token_balance
         from public.campaigns
         where id = any($1::text[])`,
        [claimCampaignIds]
      );
      const byId = new Map<string, { tokenMint: string; minTokenBalance: bigint }>();
      for (const row of campaignsRes.rows ?? []) {
        const id = String(row.id);
        const tokenMint = String(row.token_mint ?? "").trim();
        const minTokenBalance = BigInt(String(row.min_token_balance ?? "0"));
        if (id && tokenMint) byId.set(id, { tokenMint, minTokenBalance });
      }

      for (const campaignId of claimCampaignIds) {
        const c = byId.get(campaignId);
        if (!c) {
          return NextResponse.json(
            { error: "Campaign configuration not found for claim" },
            { status: 500 }
          );
        }

        const minRequired = c.minTokenBalance > 0n ? c.minTokenBalance : 1n;
        let current = 0n;
        try {
          const mintPk = new PublicKey(c.tokenMint);
          current = (await getTokenBalanceForMint({ connection, owner: recipientPubkey, mint: mintPk })).amountRaw;
        } catch {
          return NextResponse.json(
            { error: "Failed to verify token balance" },
            { status: 503 }
          );
        }

        if (current < minRequired) {
          return NextResponse.json(
            {
              error: "Must be holding the token to claim rewards",
              campaignId,
              tokenMint: c.tokenMint,
              minRequired: minRequired.toString(),
              current: current.toString(),
            },
            { status: 403 }
          );
        }
      }
    }

    let splMint: string | null = null;
    if (isSplClaim) {
      const mints = [...new Set(splRewards.map(r => r.rewardMint))];
      if (mints.length > 1) {
        return NextResponse.json({ error: "Multiple SPL token types" }, { status: 400 });
      }
      splMint = mints[0];
    }

    const manualRewards = rewardsToClaim.filter((r) => r.isManualLockup);
    const isManualClaim = manualRewards.length > 0;
    if (isManualClaim && manualRewards.length !== rewardsToClaim.length) {
      return NextResponse.json(
        { error: "Cannot claim manual-lockup rewards together with non-manual rewards" },
        { status: 400 }
      );
    }

    // Get payout wallet pubkey for NON-manual SOL validation only
    const payoutKeypair = !isSplClaim && !isManualClaim
      ? (() => {
          const payoutSecret = process.env.AMPLIFI_PAYOUT_SECRET_KEY || process.env.ESCROW_FEE_PAYER_SECRET_KEY;
          if (!payoutSecret) throw new Error("Payout wallet not configured");
          return keypairFromBase58Secret(payoutSecret);
        })()
      : null;

    const totalLamports = rewardsToClaim.reduce((sum, r) => sum + r.rewardLamports, 0n);
    if (!isSplClaim && totalLamports < BigInt(AMPLIFI_PAYOUT_MIN_LAMPORTS)) {
      return NextResponse.json({ 
        error: "No rewards available to claim",
        hint: "You may have already claimed your rewards, or you haven't earned any yet."
      }, { status: 400 });
    }
    if (isSplClaim && totalLamports < AMPLIFI_SPL_MIN_AMOUNT) {
      return NextResponse.json({ 
        error: "No token rewards available to claim",
        hint: "You may have already claimed your token rewards, or you haven't earned any yet."
      }, { status: 400 });
    }

    // Build expected transaction to validate
    const expected = new Transaction();
    expected.recentBlockhash = tx.recentBlockhash;
    expected.lastValidBlockHeight = tx.lastValidBlockHeight;
    expected.feePayer = recipientPubkey;

    if (isSplClaim && splMint) {
      // SPL Token Transfer validation - must come from the campaign escrow wallet
      const campaignIds = [...new Set(rewardsToClaim.map((r) => r.campaignId))];
      if (campaignIds.length !== 1) {
        return NextResponse.json({ error: "SPL rewards from multiple campaigns" }, { status: 400 });
      }

      const campaignId = campaignIds[0];
      const escrowWallet = await getCampaignEscrowWallet(campaignId);
      if (!escrowWallet) {
        return NextResponse.json({ error: "Campaign escrow wallet not found" }, { status: 400 });
      }

      const escrowPubkey = new PublicKey(escrowWallet.walletPubkey);
      const mintPubkey = new PublicKey(splMint);
      const tokenProgram = await getTokenProgramIdForMint({ connection, mint: mintPubkey });

      const sourceAta = getAssociatedTokenAddress({ owner: escrowPubkey, mint: mintPubkey, tokenProgram });
      const { ix: createAtaIx, ata: destinationAta } = buildCreateAssociatedTokenAccountIdempotentInstruction({
        payer: recipientPubkey,
        owner: recipientPubkey,
        mint: mintPubkey,
        tokenProgram,
      });
      const transferIx = buildSplTokenTransferInstruction({
        sourceAta,
        destinationAta,
        owner: escrowPubkey,
        amountRaw: totalLamports,
        tokenProgram,
      });

      expected.add(createAtaIx);
      expected.add(transferIx);

      // Escrow wallet must have signed this transaction
      const escrowSigEntry = tx.signatures.find((s) => s.publicKey.equals(escrowPubkey));
      const escrowSigBytes = escrowSigEntry?.signature ?? null;
      if (!escrowSigBytes) {
        return NextResponse.json({ error: "Missing escrow wallet signature" }, { status: 400 });
      }
    } else {
      // SOL Transfer validation
      const totalLamportsNum = requireSafeLamportsNumber(totalLamports);

      if (isManualClaim) {
        const campaignIds = [...new Set(rewardsToClaim.map((r) => r.campaignId))];
        if (campaignIds.length !== 1) {
          return NextResponse.json(
            { error: "Manual-lockup rewards from multiple campaigns" },
            { status: 400 }
          );
        }

        const campaignId = campaignIds[0];
        const escrowWallet = await getCampaignEscrowWallet(campaignId);
        if (!escrowWallet) {
          return NextResponse.json({ error: "Campaign escrow wallet not found" }, { status: 400 });
        }

        const escrowPubkey = new PublicKey(escrowWallet.walletPubkey);
        expected.add(
          SystemProgram.transfer({
            fromPubkey: escrowPubkey,
            toPubkey: recipientPubkey,
            lamports: totalLamportsNum,
          })
        );

        const escrowSigEntry = tx.signatures.find((s) => s.publicKey.equals(escrowPubkey));
        const escrowSigBytes = escrowSigEntry?.signature ?? null;
        if (!escrowSigBytes) {
          return NextResponse.json({ error: "Missing escrow wallet signature" }, { status: 400 });
        }
      } else {
        expected.add(
          SystemProgram.transfer({
            fromPubkey: payoutKeypair!.publicKey,
            toPubkey: recipientPubkey,
            lamports: totalLamportsNum,
          })
        );
      }
    }

    const actualStripped = stripComputeBudgetInstructions(tx);
    const msgA = actualStripped.serializeMessage();
    const msgB = expected.serializeMessage();
    if (Buffer.compare(Buffer.from(Uint8Array.from(msgA)), Buffer.from(Uint8Array.from(msgB))) !== 0) {
      return NextResponse.json({ error: "Signed transaction does not match expected claim" }, { status: 400 });
    }

    // For non-manual SOL claims, verify payout keypair signature
    if (!isSplClaim && !isManualClaim) {
      const payoutSigEntry = tx.signatures.find((s) => s.publicKey.equals(payoutKeypair!.publicKey));
      const payoutSigBytes = payoutSigEntry?.signature ?? null;
      if (!payoutSigBytes) {
        return NextResponse.json({ error: "Missing payout signature" }, { status: 400 });
      }
    }

    const client = await pool.connect();
    let reservedEpochIds: string[] = [];
    let claimedAtUnix = nowUnix;
    try {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock(hashtext($1))", [`amplifi_reward_claim_wallet:${walletPubkey}`]);

      await client.query(
        `delete from public.reward_claims
         where wallet_pubkey=$1
           and status='pending'
           and claimed_at_unix < $2
           and (tx_sig is null or tx_sig='')
        `,
        [walletPubkey, String(staleBefore)]
      );

      const pendingRes = await client.query(
        `select epoch_id, claimed_at_unix
         from public.reward_claims
         where wallet_pubkey=$1
           and status='pending'`,
        [walletPubkey]
      );
      const pending = pendingRes.rows ?? [];
      if (pending.length) {
        const fresh: string[] = [];
        for (const r of pending) {
          const ca = Number(r?.claimed_at_unix);
          if (!Number.isFinite(ca) || ca <= 0) continue;
          if (nowUnix - ca <= ttlSeconds) fresh.push(String(r?.epoch_id ?? ""));
        }
        if (fresh.length) {
          await client.query("rollback");
          return NextResponse.json({ error: "Found pending reward claims" }, { status: 409 });
        }
      }

      claimedAtUnix = nowUnix;
      reservedEpochIds = [];
      for (const reward of rewardsToClaim) {
        const id = crypto.randomUUID();
        const inserted = await client.query(
          `insert into public.reward_claims (id, epoch_id, wallet_pubkey, amount_lamports, tx_sig, claimed_at_unix, status)
           values ($1,$2,$3,$4,$5,$6,'pending')
           on conflict (epoch_id, wallet_pubkey) do update set
             amount_lamports = excluded.amount_lamports,
             tx_sig = excluded.tx_sig,
             claimed_at_unix = excluded.claimed_at_unix,
             status = 'pending'
           where reward_claims.status = 'pending'
             and reward_claims.claimed_at_unix < $7
             and (reward_claims.tx_sig is null or reward_claims.tx_sig='')
           returning epoch_id`,
          [id, reward.epochId, walletPubkey, reward.rewardLamports.toString(), txSig, String(claimedAtUnix), String(staleBefore)]
        );
        if (!inserted.rows?.[0]) {
          await client.query("rollback");
          return NextResponse.json({ error: "Found pending reward claims" }, { status: 409 });
        }
        reservedEpochIds.push(reward.epochId);
      }

      await client.query("commit");
    } catch (e) {
      try {
        await client.query("rollback");
      } catch {
      }
      throw e;
    } finally {
      client.release();
    }

    try {
      const sig = await withRetry(() =>
        connection.sendRawTransaction(tx.serialize(), {
          skipPreflight: false,
          preflightCommitment: "confirmed",
          maxRetries: 3,
        })
      );

      if (sig !== txSig) {
        throw new Error("Transaction signature mismatch");
      }

      await confirmSignatureViaRpc(connection, sig, "confirmed");

      await withRetry(() =>
        pool.query(
          `update public.reward_claims
           set tx_sig=$3, status='completed'
           where wallet_pubkey=$1
             and epoch_id = any($2::text[])
             and claimed_at_unix=$4
             and status='pending'`,
          [walletPubkey, reservedEpochIds, sig, String(claimedAtUnix)]
        )
      );

      const claimResults = rewardsToClaim.map((r) => ({ epochId: r.epochId, amount: r.rewardLamports.toString(), success: true }));

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
        sig,
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
        sig,
        "confirmed",
        nowUnix,
        nowUnix,
      ]
    );

    const rewardDecimals = isSplClaim ? (rewardsToClaim[0]?.rewardDecimals ?? 6) : 9;
    const divisor = 10 ** rewardDecimals;

    return NextResponse.json({
      success: true,
      txSig: sig,
      totalLamports: totalLamports.toString(),
      totalAmount: (Number(totalLamports) / divisor).toFixed(rewardDecimals > 6 ? 9 : 6),
      totalSol: isSplClaim ? undefined : (Number(totalLamports) / 1_000_000_000).toFixed(9),
      rewardAssetType: isSplClaim ? "spl" : "sol",
      rewardMint: splMint,
      epochsClaimed: claimResults.length,
      claims: claimResults,
    });
    } catch (sendErr) {
      const msg = sendErr instanceof Error ? sendErr.message : String(sendErr);
      if (msg.toLowerCase().includes("timeout")) {
        return NextResponse.json(
          {
            error: "Transaction confirmation timeout",
            code: "confirmation_timeout",
            hint: "Your transaction may still confirm. Check your wallet activity and try again later.",
            signature: txSig,
          },
          { status: 202 }
        );
      }

      try {
        const st = await withRetry(() => connection.getSignatureStatuses([txSig], { searchTransactionHistory: true }));
        const s = (st?.value?.[0] as any) ?? null;
        const cs = String(s?.confirmationStatus ?? "");
        const confirmed = !s?.err && (cs === "confirmed" || cs === "finalized");
        if (confirmed) {
          await withRetry(() =>
            pool.query(
              `update public.reward_claims
               set tx_sig=$3, status='completed'
               where wallet_pubkey=$1
                 and epoch_id = any($2::text[])
                 and claimed_at_unix=$4
                 and status='pending'`,
              [walletPubkey, reservedEpochIds, txSig, String(claimedAtUnix)]
            )
          );
          return NextResponse.json({ ok: true, txSig, recovered: true });
        }

        if (!s?.err) {
          return NextResponse.json(
            {
              error: "Found pending reward claims",
              hint: "A claim is already in progress. Wait a moment and try again.",
              signature: txSig,
            },
            { status: 409 }
          );
        }
      } catch {
      }

      await withRetry(() =>
        pool.query(
          `delete from public.reward_claims
           where wallet_pubkey=$1
             and epoch_id = any($2::text[])
             and claimed_at_unix=$3
             and status='pending'`,
          [walletPubkey, reservedEpochIds, String(claimedAtUnix)]
        )
      );
      throw sendErr;
    }
  } catch (error) {
    console.error("[Claim POST] Error:", error);
    return NextResponse.json(
      { error: "Failed to process claim", details: String(error) },
      { status: 500 }
    );
  }
}

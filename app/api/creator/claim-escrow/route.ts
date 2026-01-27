import { NextResponse } from "next/server";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";

import { auditLog } from "../../../lib/auditLog";
import { getCampaignEscrowWallet } from "../../../lib/campaignEscrow";
import { getCampaignById, getCampaignParticipants } from "../../../lib/campaignStore";
import { getPool, hasDatabase } from "../../../lib/db";
import { privySignSolanaTransaction } from "../../../lib/privy";
import { getSafeErrorMessage, redactSensitive } from "../../../lib/safeError";
import { getConnection, getBalanceLamports, confirmTransactionSignature, keypairFromBase58Secret } from "../../../lib/solana";
import { checkRateLimit } from "../../../lib/rateLimit";

export const runtime = "nodejs";

/**
 * POST /api/creator/claim-escrow
 * 
 * Creator endpoint to claim SOL from their campaign escrow wallet.
 * Only works for campaigns where the creator is the project owner and there are no active participants.
 * Sends funds to the creator's wallet (the one that signed the request).
 */
export async function POST(req: Request) {
  try {
    const rl = await checkRateLimit(req, { keyPrefix: "creator:claim-escrow", limit: 10, windowSeconds: 60 });
    if (!rl.allowed) {
      const res = NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
      res.headers.set("retry-after", String(rl.retryAfterSeconds));
      return res;
    }

    const body = (await req.json().catch(() => ({}))) as any;
    const campaignId = typeof body.campaignId === "string" ? body.campaignId.trim() : "";
    const walletPubkey = typeof body.walletPubkey === "string" ? body.walletPubkey.trim() : "";
    const timestampUnix = Number(body.timestampUnix);
    const signatureB58 = typeof body.signatureB58 === "string" ? body.signatureB58.trim() : "";

    if (!campaignId) {
      return NextResponse.json({ error: "campaignId is required" }, { status: 400 });
    }
    if (!walletPubkey) {
      return NextResponse.json({ error: "walletPubkey is required" }, { status: 400 });
    }
    if (!Number.isFinite(timestampUnix) || timestampUnix <= 0) {
      return NextResponse.json({ error: "timestampUnix is required" }, { status: 400 });
    }
    if (!signatureB58) {
      return NextResponse.json({ error: "signatureB58 is required" }, { status: 400 });
    }

    // Verify signature
    let creatorPubkey: PublicKey;
    try {
      creatorPubkey = new PublicKey(walletPubkey);
    } catch {
      return NextResponse.json({ error: "Invalid walletPubkey" }, { status: 400 });
    }

    const nowUnix = Math.floor(Date.now() / 1000);
    const skew = Math.abs(nowUnix - timestampUnix);
    if (skew > 10 * 60) {
      return NextResponse.json({ error: "Timestamp too far from current time" }, { status: 400 });
    }

    const expectedMsg = `AmpliFi\nCreator Escrow Claim\nCampaign: ${campaignId}\nWallet: ${walletPubkey}\nTimestamp: ${timestampUnix}`;
    const signature = bs58.decode(signatureB58);
    const verified = nacl.sign.detached.verify(
      new TextEncoder().encode(expectedMsg),
      signature,
      creatorPubkey.toBytes()
    );
    if (!verified) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    if (!hasDatabase()) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    // Get campaign
    const campaign = await getCampaignById(campaignId);
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    // Verify the requester is the campaign creator/project owner
    const projectPubkey = String(campaign.projectPubkey ?? "").trim();
    if (projectPubkey !== walletPubkey) {
      // Also check if they're the authority on the commitment
      const pool = getPool();
      const commitmentRes = await pool.query(
        `SELECT authority, creator_pubkey FROM public.commitments WHERE token_mint = $1 LIMIT 1`,
        [campaign.tokenMint]
      );
      const commitment = commitmentRes.rows?.[0];
      const authority = String(commitment?.authority ?? "").trim();
      const creatorPk = String(commitment?.creator_pubkey ?? "").trim();
      
      if (authority !== walletPubkey && creatorPk !== walletPubkey) {
        await auditLog("creator_escrow_claim_denied", {
          campaignId,
          walletPubkey,
          projectPubkey,
          authority,
          reason: "not_creator",
        });
        return NextResponse.json({ error: "Only the campaign creator can claim escrow funds" }, { status: 403 });
      }
    }

    // Check participants - allow claim if fewer than 2 participants (can cancel small campaigns)
    const participants = await getCampaignParticipants(campaignId);
    const activeParticipants = participants.filter(p => p.status === "active");
    
    if (activeParticipants.length >= 2) {
      await auditLog("creator_escrow_claim_blocked", {
        campaignId,
        walletPubkey,
        reason: "has_multiple_participants",
        participantCount: activeParticipants.length,
      });
      return NextResponse.json({ 
        error: `Cannot claim - campaign has ${activeParticipants.length} active participants (need < 2 to cancel)`,
        participantCount: activeParticipants.length,
      }, { status: 400 });
    }

    // Get escrow wallet
    const escrow = await getCampaignEscrowWallet(campaignId);
    if (!escrow) {
      return NextResponse.json({ error: "No escrow wallet found for this campaign" }, { status: 404 });
    }

    const connection = getConnection();
    const escrowPubkey = new PublicKey(escrow.walletPubkey);

    // Get balance
    const balanceLamports = await getBalanceLamports(connection, escrowPubkey);

    // Fee payer (server-side) pays tx fees so escrow can be drained safely.
    const feePayerSecret = String(process.env.ESCROW_FEE_PAYER_SECRET_KEY ?? "").trim();
    if (!feePayerSecret) {
      return NextResponse.json({ error: "ESCROW_FEE_PAYER_SECRET_KEY is required" }, { status: 500 });
    }
    const feePayer = keypairFromBase58Secret(feePayerSecret);

    // Keep a tiny buffer so the escrow account isn't fully drained to 0.
    const keepLamports = 5_000;
    const transferLamports = Math.max(0, balanceLamports - keepLamports);

    if (transferLamports <= 0) {
      return NextResponse.json({ 
        error: "Escrow wallet has no claimable balance",
        balanceLamports,
        escrowPubkey: escrow.walletPubkey,
      }, { status: 400 });
    }

    // Build and sign transaction
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");

    const tx = new Transaction();
    tx.feePayer = feePayer.publicKey;
    tx.recentBlockhash = blockhash;
    tx.lastValidBlockHeight = lastValidBlockHeight;
    tx.add(
      SystemProgram.transfer({
        fromPubkey: escrowPubkey,
        toPubkey: creatorPubkey,
        lamports: transferLamports,
      })
    );

    tx.partialSign(feePayer);

    const txBase64 = tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");
    const signed = await privySignSolanaTransaction({
      walletId: escrow.privyWalletId,
      transactionBase64: txBase64,
    });

    const raw = Buffer.from(String(signed.signedTransactionBase64), "base64");
    const txSignature = await connection.sendRawTransaction(raw, {
      skipPreflight: false,
      preflightCommitment: "processed",
      maxRetries: 2,
    });

    await confirmTransactionSignature({ connection, signature: txSignature, blockhash, lastValidBlockHeight });

    await auditLog("creator_escrow_claim_ok", {
      campaignId,
      walletPubkey,
      escrowPubkey: escrow.walletPubkey,
      transferLamports,
      signature: txSignature,
    });

    return NextResponse.json({
      ok: true,
      campaignId,
      escrowPubkey: escrow.walletPubkey,
      transferLamports,
      transferSol: transferLamports / 1e9,
      signature: txSignature,
      message: `Claimed ${(transferLamports / 1e9).toFixed(4)} SOL from campaign escrow`,
    });

  } catch (e) {
    const safe = getSafeErrorMessage(e);
    const rawError = redactSensitive(String((e as any)?.message ?? e ?? ""));
    await auditLog("creator_escrow_claim_error", { error: safe, rawError });
    return NextResponse.json({ error: safe, rawError }, { status: 500 });
  }
}

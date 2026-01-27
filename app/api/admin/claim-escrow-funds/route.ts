import { NextResponse } from "next/server";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";

import { isAdminRequestAsync } from "../../../lib/adminAuth";
import { verifyAdminOrigin, getAdminSessionWallet } from "../../../lib/adminSession";
import { auditLog } from "../../../lib/auditLog";
import { getCampaignEscrowWallet } from "../../../lib/campaignEscrow";
import { getCampaignById, getCampaignParticipants } from "../../../lib/campaignStore";
import { getPool, hasDatabase } from "../../../lib/db";
import { privySignSolanaTransaction } from "../../../lib/privy";
import { getSafeErrorMessage } from "../../../lib/safeError";
import { getConnection, getBalanceLamports, confirmTransactionSignature } from "../../../lib/solana";

export const runtime = "nodejs";

/**
 * POST /api/admin/claim-escrow-funds
 * 
 * Admin-only endpoint to claim all SOL from a campaign escrow wallet.
 * Only works for campaigns with zero active participants.
 * Sends funds to the admin's wallet.
 */
export async function POST(req: Request) {
  try {
    verifyAdminOrigin(req);
    const adminOk = await isAdminRequestAsync(req);
    if (!adminOk) {
      await auditLog("claim_escrow_funds_denied", { reason: "unauthorized" });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminWallet = await getAdminSessionWallet(req);
    if (!adminWallet) {
      return NextResponse.json({ error: "No admin session" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as any;
    const campaignId = typeof body.campaignId === "string" ? body.campaignId.trim() : "";

    if (!campaignId) {
      return NextResponse.json({ error: "campaignId is required" }, { status: 400 });
    }

    if (!hasDatabase()) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    // Get campaign
    const campaign = await getCampaignById(campaignId);
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    // Check participants
    const participants = await getCampaignParticipants(campaignId);
    const activeParticipants = participants.filter(p => p.status === "active");
    
    if (activeParticipants.length > 0) {
      await auditLog("claim_escrow_funds_blocked", {
        campaignId,
        adminWallet,
        reason: "has_active_participants",
        participantCount: activeParticipants.length,
      });
      return NextResponse.json({ 
        error: `Cannot claim funds - campaign has ${activeParticipants.length} active participant(s)`,
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
    const adminPubkey = new PublicKey(adminWallet);

    // Get balance
    const balanceLamports = await getBalanceLamports(connection, escrowPubkey);
    
    // Keep minimum for rent (5000 lamports)
    const keepLamports = 5000;
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
    tx.feePayer = escrowPubkey;
    tx.recentBlockhash = blockhash;
    tx.lastValidBlockHeight = lastValidBlockHeight;
    tx.add(
      SystemProgram.transfer({
        fromPubkey: escrowPubkey,
        toPubkey: adminPubkey,
        lamports: transferLamports,
      })
    );

    const txBase64 = tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");
    const signed = await privySignSolanaTransaction({
      walletId: escrow.privyWalletId,
      transactionBase64: txBase64,
    });

    const raw = Buffer.from(String(signed.signedTransactionBase64), "base64");
    const signature = await connection.sendRawTransaction(raw, {
      skipPreflight: false,
      preflightCommitment: "processed",
      maxRetries: 2,
    });

    await confirmTransactionSignature({ connection, signature, blockhash, lastValidBlockHeight });

    // Update campaign status to cancelled
    const pool = getPool();
    const nowUnix = Math.floor(Date.now() / 1000);
    await pool.query(
      `UPDATE public.campaigns SET status = 'cancelled', updated_at_unix = $2 WHERE id = $1`,
      [campaignId, nowUnix]
    );

    await auditLog("claim_escrow_funds_ok", {
      campaignId,
      adminWallet,
      escrowPubkey: escrow.walletPubkey,
      transferLamports,
      signature,
    });

    return NextResponse.json({
      ok: true,
      campaignId,
      escrowPubkey: escrow.walletPubkey,
      transferLamports,
      transferSol: transferLamports / 1e9,
      signature,
      message: `Claimed ${(transferLamports / 1e9).toFixed(4)} SOL from campaign escrow`,
    });

  } catch (e) {
    await auditLog("claim_escrow_funds_error", { error: getSafeErrorMessage(e) });
    return NextResponse.json({ error: getSafeErrorMessage(e) }, { status: 500 });
  }
}

/**
 * GET /api/admin/claim-escrow-funds
 * 
 * List all campaigns with their escrow balances and participant counts.
 * Admin-only.
 */
export async function GET(req: Request) {
  try {
    verifyAdminOrigin(req);
    const adminOk = await isAdminRequestAsync(req);
    if (!adminOk) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasDatabase()) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    const pool = getPool();
    const connection = getConnection();

    // Get all campaigns with escrow wallets
    const result = await pool.query(`
      SELECT c.id, c.name, c.token_mint, c.status, c.project_pubkey,
             c.total_fee_lamports, c.platform_fee_lamports, c.reward_pool_lamports,
             e.wallet_pubkey as escrow_pubkey, e.privy_wallet_id
      FROM public.campaigns c
      LEFT JOIN public.campaign_escrow_wallets e ON e.campaign_id = c.id
      WHERE c.status NOT IN ('cancelled')
      ORDER BY c.created_at_unix DESC
    `);

    const campaigns = [];

    for (const row of result.rows) {
      const participants = await getCampaignParticipants(row.id);
      const activeCount = participants.filter(p => p.status === "active").length;

      let escrowBalanceLamports = 0;
      if (row.escrow_pubkey) {
        try {
          const pk = new PublicKey(row.escrow_pubkey);
          escrowBalanceLamports = await getBalanceLamports(connection, pk);
        } catch {
          // ignore
        }
      }

      campaigns.push({
        id: row.id,
        name: row.name,
        tokenMint: row.token_mint,
        status: row.status,
        projectPubkey: row.project_pubkey,
        escrowPubkey: row.escrow_pubkey || null,
        escrowBalanceLamports,
        escrowBalanceSol: escrowBalanceLamports / 1e9,
        activeParticipants: activeCount,
        canClaim: activeCount === 0 && escrowBalanceLamports > 5000,
        totalFeeLamports: row.total_fee_lamports,
        platformFeeLamports: row.platform_fee_lamports,
        rewardPoolLamports: row.reward_pool_lamports,
      });
    }

    return NextResponse.json({
      ok: true,
      campaigns,
      claimableCampaigns: campaigns.filter(c => c.canClaim),
    });

  } catch (e) {
    return NextResponse.json({ error: getSafeErrorMessage(e) }, { status: 500 });
  }
}

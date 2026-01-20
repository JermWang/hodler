import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";
import crypto from "crypto";

import { getCampaignById } from "@/app/lib/campaignStore";
import { hasDatabase, getPool } from "@/app/lib/db";
import { getAssociatedTokenAddress, getConnection, getTokenProgramIdForMint } from "@/app/lib/solana";
import { auditLog } from "@/app/lib/auditLog";
import { withRetry } from "@/app/lib/rpc";
import { getCampaignEscrowWallet, createCampaignEscrowWallet, getCampaignEscrowTokenBalance } from "@/app/lib/campaignEscrow";

export const runtime = "nodejs";

/**
 * POST /api/campaigns/[id]/deposit
 * 
 * Record a deposit to a campaign's reward pool.
 * The deposit transaction should already be confirmed on-chain.
 * This endpoint verifies the transaction and updates the campaign's reward pool.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (!hasDatabase()) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    const body = await req.json();
    const {
      depositorPubkey,
      txSig,
      assetType,
      amountLamports,
      amountRaw,
      mint,
      signature,
      timestamp,
    } = body;

    // Validate required fields
    if (!depositorPubkey || !txSig || !assetType) {
      return NextResponse.json(
        { error: "depositorPubkey, txSig, and assetType are required" },
        { status: 400 }
      );
    }

    if (assetType !== "sol" && assetType !== "spl") {
      return NextResponse.json({ error: "assetType must be 'sol' or 'spl'" }, { status: 400 });
    }

    if (assetType === "sol" && !amountLamports) {
      return NextResponse.json({ error: "amountLamports required for SOL deposits" }, { status: 400 });
    }

    if (assetType === "spl" && (!amountRaw || !mint)) {
      return NextResponse.json({ error: "amountRaw and mint required for SPL deposits" }, { status: 400 });
    }

    // Validate timestamp
    const timestampUnix = parseInt(timestamp, 10);
    const nowUnix = Math.floor(Date.now() / 1000);
    if (!Number.isFinite(timestampUnix)) {
      return NextResponse.json({ error: "Invalid timestamp" }, { status: 400 });
    }
    if (Math.abs(nowUnix - timestampUnix) > 300) {
      return NextResponse.json({ error: "Signature timestamp expired" }, { status: 400 });
    }

    // Validate pubkeys
    let depositorPk: PublicKey;
    try {
      depositorPk = new PublicKey(String(depositorPubkey));
    } catch {
      return NextResponse.json({ error: "Invalid depositorPubkey" }, { status: 400 });
    }

    // Verify signature
    let sigBytes: Uint8Array;
    try {
      sigBytes = bs58.decode(String(signature));
    } catch {
      return NextResponse.json({ error: "Invalid signature encoding" }, { status: 400 });
    }

    const msg = `AmpliFi\nDeposit\nCampaign: ${params.id}\nTx: ${txSig}\nTimestamp: ${timestampUnix}`;
    const ok = nacl.sign.detached.verify(new TextEncoder().encode(msg), sigBytes, depositorPk.toBytes());
    if (!ok) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // Get campaign
    const campaign = await getCampaignById(params.id);
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    // Verify depositor is the campaign creator
    if (campaign.projectPubkey !== depositorPubkey) {
      return NextResponse.json(
        { error: "Only the campaign creator can deposit" },
        { status: 403 }
      );
    }

    if (!campaign.isManualLockup) {
      return NextResponse.json(
        { error: "Deposits are only supported for manual-lockup campaigns" },
        { status: 400 }
      );
    }

    let escrowWalletPubkey: string | null = campaign.escrowWalletPubkey || null;
    if (!escrowWalletPubkey) {
      let escrow = await getCampaignEscrowWallet(params.id);
      if (!escrow) {
        escrow = await createCampaignEscrowWallet(params.id);
      }
      escrowWalletPubkey = escrow.walletPubkey;
    }

    let escrowPk: PublicKey;
    try {
      escrowPk = new PublicKey(String(escrowWalletPubkey));
    } catch {
      return NextResponse.json({ error: "Invalid escrow wallet pubkey" }, { status: 500 });
    }

    // For SPL deposits, verify the mint matches the campaign's reward mint
    if (assetType === "spl") {
      if (campaign.rewardAssetType !== "spl") {
        return NextResponse.json(
          { error: "Campaign is configured for SOL rewards, not SPL" },
          { status: 400 }
        );
      }
      if (campaign.rewardMint && campaign.rewardMint !== mint) {
        return NextResponse.json(
          { error: `Campaign reward mint mismatch. Expected: ${campaign.rewardMint}` },
          { status: 400 }
        );
      }
    }

    // Verify transaction exists on-chain
    const connection = getConnection();
    const txStatus = await withRetry(() => 
      connection.getSignatureStatuses([txSig], { searchTransactionHistory: true })
    );
    const status = txStatus?.value?.[0];
    
    if (!status) {
      return NextResponse.json(
        { error: "Transaction not found on-chain" },
        { status: 400 }
      );
    }

    if (status.err) {
      return NextResponse.json(
        { error: "Transaction failed on-chain", details: JSON.stringify(status.err) },
        { status: 400 }
      );
    }

    const confirmationStatus = status.confirmationStatus;
    if (confirmationStatus !== "confirmed" && confirmationStatus !== "finalized") {
      return NextResponse.json(
        { error: "Transaction not yet confirmed", status: confirmationStatus },
        { status: 400 }
      );
    }

    const parsedTx = await withRetry(() =>
      connection.getParsedTransaction(String(txSig), {
        maxSupportedTransactionVersion: 0,
        commitment: confirmationStatus,
      })
    );
    if (!parsedTx) {
      return NextResponse.json({ error: "Unable to load transaction" }, { status: 400 });
    }

    const ixs: any[] = (parsedTx as any)?.transaction?.message?.instructions ?? [];

    let verifiedAmountLamports: bigint | null = null;
    let verifiedAmountRaw: bigint | null = null;

    if (assetType === "sol") {
      let sum = 0n;
      for (const ix of ixs) {
        const program = String(ix?.program ?? "").toLowerCase();
        const parsed = ix?.parsed;
        const info = parsed?.info;
        if (program !== "system") continue;
        if (String(parsed?.type ?? "") !== "transfer") continue;
        const src = String(info?.source ?? "");
        const dst = String(info?.destination ?? "");
        const lamports = BigInt(String(info?.lamports ?? "0"));
        if (src === depositorPk.toBase58() && dst === escrowPk.toBase58() && lamports > 0n) {
          sum += lamports;
        }
      }

      if (sum <= 0n) {
        return NextResponse.json(
          { error: "No matching SOL transfer found to escrow" },
          { status: 400 }
        );
      }

      verifiedAmountLamports = sum;
      const declared = BigInt(String(amountLamports));
      if (declared !== verifiedAmountLamports) {
        return NextResponse.json(
          {
            error: "Deposit amount mismatch",
            declaredLamports: declared.toString(),
            onchainLamports: verifiedAmountLamports.toString(),
          },
          { status: 400 }
        );
      }
    }

    if (assetType === "spl") {
      if (campaign.rewardAssetType !== "spl") {
        return NextResponse.json(
          { error: "Campaign is configured for SOL rewards, not SPL" },
          { status: 400 }
        );
      }

      let mintPk: PublicKey;
      try {
        mintPk = new PublicKey(String(mint));
      } catch {
        return NextResponse.json({ error: "Invalid mint" }, { status: 400 });
      }

      const tokenProgram = await getTokenProgramIdForMint({ connection, mint: mintPk });
      const expectedDestinationAta = getAssociatedTokenAddress({ owner: escrowPk, mint: mintPk, tokenProgram });

      let sum = 0n;
      for (const ix of ixs) {
        const program = String(ix?.program ?? "").toLowerCase();
        const parsed = ix?.parsed;
        const info = parsed?.info;
        if (!program.includes("spl-token")) continue;
        const t = String(parsed?.type ?? "");
        if (t !== "transfer" && t !== "transferChecked") continue;

        const authority = String(info?.authority ?? "");
        const dst = String(info?.destination ?? "");
        if (authority !== depositorPk.toBase58()) continue;
        if (dst !== expectedDestinationAta.toBase58()) continue;

        const mintFromIx = String(info?.mint ?? "");
        if (mintFromIx && mintFromIx !== mintPk.toBase58()) continue;

        const amountStr =
          typeof info?.amount === "string"
            ? info.amount
            : typeof info?.tokenAmount?.amount === "string"
              ? info.tokenAmount.amount
              : "0";
        const amt = BigInt(String(amountStr));
        if (amt > 0n) sum += amt;
      }

      if (sum <= 0n) {
        return NextResponse.json(
          { error: "No matching SPL token transfer found to escrow" },
          { status: 400 }
        );
      }

      verifiedAmountRaw = sum;
      const declared = BigInt(String(amountRaw));
      if (declared !== verifiedAmountRaw) {
        return NextResponse.json(
          {
            error: "Deposit amount mismatch",
            declaredAmountRaw: declared.toString(),
            onchainAmountRaw: verifiedAmountRaw.toString(),
          },
          { status: 400 }
        );
      }
    }

    const pool = getPool();
    const depositId = crypto.randomUUID();

    // Check for duplicate deposit
    const existingDeposit = await pool.query(
      `SELECT id FROM public.campaign_deposits WHERE tx_sig = $1`,
      [txSig]
    );

    if (existingDeposit.rows.length > 0) {
      return NextResponse.json(
        { error: "Deposit already recorded", depositId: existingDeposit.rows[0].id },
        { status: 409 }
      );
    }

    // Record the deposit
    await pool.query(
      `INSERT INTO public.campaign_deposits 
       (id, campaign_id, asset_type, mint, amount_lamports, amount_raw, tx_sig, depositor_pubkey, status, deposited_at_unix, created_at_unix)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        depositId,
        params.id,
        assetType,
        assetType === "spl" ? String(mint) : null,
        assetType === "sol" ? verifiedAmountLamports!.toString() : null,
        assetType === "spl" ? verifiedAmountRaw!.toString() : null,
        txSig,
        depositorPubkey,
        "confirmed",
        nowUnix,
        nowUnix,
      ]
    );

    // Update campaign reward pool
    if (assetType === "sol") {
      const depositAmount = verifiedAmountLamports!;
      // For manual lockups, 100% goes to reward pool (no platform fee split)
      const rewardPoolIncrease = campaign.isManualLockup ? depositAmount : depositAmount / 2n;
      
      await pool.query(
        `UPDATE public.campaigns 
         SET reward_pool_lamports = reward_pool_lamports + $2,
             total_fee_lamports = total_fee_lamports + $3,
             updated_at_unix = $4
         WHERE id = $1`,
        [params.id, rewardPoolIncrease.toString(), depositAmount.toString(), nowUnix]
      );
    }

    // For SPL deposits, we may need to update the campaign's reward mint if not set
    if (assetType === "spl" && !campaign.rewardMint) {
      await pool.query(
        `UPDATE public.campaigns 
         SET reward_mint = $2, updated_at_unix = $3
         WHERE id = $1`,
        [params.id, mint, nowUnix]
      );
    }

    await auditLog("campaign_deposit", {
      campaignId: params.id,
      depositId,
      depositorPubkey,
      assetType,
      amountLamports: assetType === "sol" ? verifiedAmountLamports!.toString() : null,
      amountRaw: assetType === "spl" ? verifiedAmountRaw!.toString() : null,
      mint: assetType === "spl" ? String(mint) : null,
      txSig,
    });

    return NextResponse.json({
      success: true,
      depositId,
      campaignId: params.id,
      assetType,
      amountLamports: assetType === "sol" ? verifiedAmountLamports!.toString() : null,
      amountRaw: assetType === "spl" ? verifiedAmountRaw!.toString() : null,
      txSig,
    });
  } catch (error) {
    console.error("Failed to record deposit:", error);
    return NextResponse.json(
      { error: "Failed to record deposit" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/campaigns/[id]/deposit
 * 
 * Get deposit history for a campaign
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (!hasDatabase()) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    const campaign = await getCampaignById(params.id);
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    // Get or create escrow wallet for SPL reward campaigns
    let escrowWallet: { walletPubkey: string; balance?: string } | null = null;
    if (campaign.isManualLockup) {
      let escrow = await getCampaignEscrowWallet(params.id);
      if (!escrow) {
        escrow = await createCampaignEscrowWallet(params.id);
      }

      if (campaign.rewardAssetType === "spl") {
        let balanceStr = "0";
        if (campaign.rewardMint) {
          const { balance, decimals } = await getCampaignEscrowTokenBalance({
            campaignId: params.id,
            mint: campaign.rewardMint,
          });
          const divisor = 10 ** decimals;
          balanceStr = (Number(balance) / divisor).toString();
        }
        escrowWallet = { walletPubkey: escrow.walletPubkey, balance: balanceStr };
      } else {
        escrowWallet = { walletPubkey: escrow.walletPubkey };
      }
    }

    const pool = getPool();
    const result = await pool.query(
      `SELECT * FROM public.campaign_deposits 
       WHERE campaign_id = $1 
       ORDER BY deposited_at_unix DESC`,
      [params.id]
    );

    const deposits = result.rows.map((row: any) => ({
      id: row.id,
      campaignId: row.campaign_id,
      assetType: row.asset_type,
      mint: row.mint,
      amountLamports: row.amount_lamports ? row.amount_lamports.toString() : null,
      amountRaw: row.amount_raw,
      txSig: row.tx_sig,
      depositorPubkey: row.depositor_pubkey,
      status: row.status,
      depositedAtUnix: Number(row.deposited_at_unix),
    }));

    return NextResponse.json({ 
      deposits,
      escrowWallet,
      campaign: {
        id: campaign.id,
        name: campaign.name,
        rewardAssetType: campaign.rewardAssetType,
        rewardMint: campaign.rewardMint,
        isManualLockup: campaign.isManualLockup,
      },
    });
  } catch (error) {
    console.error("Failed to fetch deposits:", error);
    return NextResponse.json(
      { error: "Failed to fetch deposits" },
      { status: 500 }
    );
  }
}

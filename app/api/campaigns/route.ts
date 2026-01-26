import { NextRequest } from "next/server";
import { getActiveCampaigns, getEndedCampaigns, getPendingCampaigns, createCampaign, createEpochsForCampaign, getCampaignById } from "@/app/lib/campaignStore";
import { hasDatabase, getPool } from "@/app/lib/db";
import { createCampaignEscrowWallet, getCampaignEscrowWallet } from "@/app/lib/campaignEscrow";
import { withTraceJson } from "@/app/lib/trace";
import {
  buildCreateAssociatedTokenAccountIdempotentInstruction,
  buildSplTokenTransferInstruction,
  getAssociatedTokenAddress,
  getConnection,
  getTokenProgramIdForMint,
} from "@/app/lib/solana";
import { withRetry } from "@/app/lib/rpc";
import { getProjectProfilesByTokenMints } from "@/app/lib/projectProfilesStore";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { Buffer } from "buffer";
import bs58 from "bs58";
import nacl from "tweetnacl";

function requireSafeLamportsNumber(value: bigint, label: string): number {
  if (value <= 0n) {
    throw new Error(`${label} must be greater than 0`);
  }
  const max = BigInt(Number.MAX_SAFE_INTEGER);
  if (value > max) {
    throw new Error(`${label} is too large`);
  }
  return Number(value);
}

/**
 * GET /api/campaigns
 * 
 * List active campaigns
 */
export async function GET(req: NextRequest) {
  const json = (body: Record<string, unknown>, init?: ResponseInit) => withTraceJson(req, body, init);

  try {
    if (!hasDatabase()) {
      return json({ error: "Database not available" }, { status: 503 });
    }

    const { searchParams } = new URL(req.url);
    const statusFilter = String(searchParams.get("status") ?? "active").toLowerCase();

    // Auto-heal legacy pending campaigns that were accidentally created with a 0 reward pool.
    // These campaigns are intended to be auto-funded later (e.g. via creator fee sweeps) and should be active.
    try {
      const pool = getPool();
      const nowUnix = Math.floor(Date.now() / 1000);
      const toHeal = await pool.query(
        `select id
         from public.campaigns
         where status='pending'
           and is_manual_lockup=true
           and reward_pool_lamports::bigint = 0
           and end_at_unix > $1`,
        [String(nowUnix)]
      );

      for (const row of toHeal.rows ?? []) {
        const id = String(row?.id ?? "").trim();
        if (!id) continue;

        const updated = await pool.query(
          `update public.campaigns
           set status='active', updated_at_unix=$2
           where id=$1 and status='pending'
           returning id`,
          [id, String(nowUnix)]
        );

        if (updated.rows?.[0]?.id) {
          const epochsExist = await pool.query(`select id from public.epochs where campaign_id=$1 limit 1`, [id]);
          if (!epochsExist.rows?.length) {
            const campaign = await getCampaignById(id);
            if (campaign) {
              await createEpochsForCampaign({ ...campaign, status: "active", updatedAtUnix: nowUnix });
            }
          }
        }
      }
    } catch {
    }

    let campaigns = [];
    if (statusFilter === "active") {
      campaigns = await getActiveCampaigns();
    } else if (statusFilter === "ended") {
      campaigns = await getEndedCampaigns();
    } else if (statusFilter === "pending") {
      campaigns = await getPendingCampaigns();
    } else {
      return json({ error: "Invalid status filter" }, { status: 400 });
    }

    // Fetch project profiles to get image URLs
    const tokenMints = campaigns.map((c) => c.tokenMint).filter(Boolean);
    const profiles = await getProjectProfilesByTokenMints(tokenMints).catch(() => []);
    const profileByMint = new Map<string, (typeof profiles)[number]>();
    for (const p of profiles) profileByMint.set(p.tokenMint, p);

    // Convert BigInt to string for JSON serialization and add image URLs
    const serializedCampaigns = campaigns.map((c) => {
      const profile = profileByMint.get(c.tokenMint);
      return {
        ...c,
        totalFeeLamports: c.totalFeeLamports.toString(),
        platformFeeLamports: c.platformFeeLamports.toString(),
        rewardPoolLamports: c.rewardPoolLamports.toString(),
        minTokenBalance: c.minTokenBalance.toString(),
        imageUrl: profile?.imageUrl ?? null,
      };
    });

    return json({ campaigns: serializedCampaigns });
  } catch (error) {
    console.error("Failed to fetch campaigns:", error);
    return json({ error: "Failed to fetch campaigns" }, { status: 500 });
  }
}

/**
 * POST /api/campaigns
 * 
 * Create a new campaign (requires project wallet signature)
 */
export async function POST(req: NextRequest) {
  const json = (body: Record<string, unknown>, init?: ResponseInit) => withTraceJson(req, body, init);

  try {
    if (!hasDatabase()) {
      return json({ error: "Database not available" }, { status: 503 });
    }

    const body = await req.json();
    
    const stage = String(body?.stage ?? (body?.fundingTxSig ? "finalize" : "prepare")).toLowerCase();
    if (stage !== "prepare" && stage !== "finalize") {
      return json({ error: "Invalid stage" }, { status: 400 });
    }

    if (stage === "finalize") {
      const campaignId = String(body?.campaignId ?? "").trim();
      const fundingTxSig = String(body?.fundingTxSig ?? "").trim();
      const signature = String(body?.signature ?? "").trim();
      const timestamp = String(body?.timestamp ?? "").trim();

      if (!campaignId || !fundingTxSig || !signature || !timestamp) {
        return json({ error: "campaignId, fundingTxSig, signature, and timestamp are required" }, { status: 400 });
      }

      const campaign = await getCampaignById(campaignId);
      if (!campaign) {
        return json({ error: "Campaign not found" }, { status: 404 });
      }
      if (campaign.status === "active") {
        return json({
          campaign: {
            ...campaign,
            totalFeeLamports: campaign.totalFeeLamports.toString(),
            platformFeeLamports: campaign.platformFeeLamports.toString(),
            rewardPoolLamports: campaign.rewardPoolLamports.toString(),
            minTokenBalance: campaign.minTokenBalance.toString(),
          },
        });
      }
      if (campaign.status !== "pending") {
        return json({ error: "Campaign is not pending" }, { status: 400 });
      }

      const timestampUnix = parseInt(timestamp, 10);
      const nowUnix = Math.floor(Date.now() / 1000);
      if (!Number.isFinite(timestampUnix)) {
        return json({ error: "Invalid timestamp" }, { status: 400 });
      }
      if (Math.abs(nowUnix - timestampUnix) > 300) {
        return json({ error: "Signature timestamp expired" }, { status: 400 });
      }

      let projectPk: PublicKey;
      try {
        projectPk = new PublicKey(String(campaign.projectPubkey));
      } catch {
        return json({ error: "Invalid project pubkey" }, { status: 400 });
      }

      let sigBytes: Uint8Array;
      try {
        sigBytes = bs58.decode(signature);
      } catch {
        return json({ error: "Invalid signature encoding" }, { status: 400 });
      }

      const msg = `AmpliFi\nFund Campaign\nCampaign: ${campaignId}\nTx: ${fundingTxSig}\nTimestamp: ${timestampUnix}`;
      const ok = nacl.sign.detached.verify(new TextEncoder().encode(msg), sigBytes, projectPk.toBytes());
      if (!ok) {
        return json({ error: "Invalid signature" }, { status: 401 });
      }

      let escrowWalletPubkey = String(campaign.escrowWalletPubkey ?? "").trim();
      if (!escrowWalletPubkey) {
        const escrow = await getCampaignEscrowWallet(campaignId);
        escrowWalletPubkey = String(escrow?.walletPubkey ?? "").trim();
      }
      if (!escrowWalletPubkey) {
        return json({ error: "Escrow wallet not found" }, { status: 400 });
      }

      let escrowPk: PublicKey;
      try {
        escrowPk = new PublicKey(escrowWalletPubkey);
      } catch {
        return json({ error: "Invalid escrow wallet pubkey" }, { status: 500 });
      }

      const connection = getConnection();
      const txStatus = await withRetry(() =>
        connection.getSignatureStatuses([fundingTxSig], { searchTransactionHistory: true })
      );
      const status = txStatus?.value?.[0];
      if (!status) {
        return json({ error: "Funding transaction not found on-chain" }, { status: 400 });
      }
      if (status.err) {
        return json(
          { error: "Funding transaction failed on-chain", details: JSON.stringify(status.err) },
          { status: 400 }
        );
      }
      const confirmationStatus = status.confirmationStatus;
      if (confirmationStatus !== "confirmed" && confirmationStatus !== "finalized") {
        return json(
          { error: "Funding transaction not yet confirmed", status: confirmationStatus },
          { status: 400 }
        );
      }

      const parsedTx = await withRetry(() =>
        connection.getParsedTransaction(String(fundingTxSig), {
          maxSupportedTransactionVersion: 0,
          commitment: confirmationStatus,
        })
      );
      if (!parsedTx) {
        return json({ error: "Unable to load funding transaction" }, { status: 400 });
      }

      const ixs: any[] = (parsedTx as any)?.transaction?.message?.instructions ?? [];
      const expectedAmount = campaign.rewardPoolLamports;
      if (expectedAmount <= 0n) {
        return json({ error: "Reward pool amount must be greater than 0" }, { status: 400 });
      }

      if (campaign.rewardAssetType === "sol") {
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
          if (src === projectPk.toBase58() && dst === escrowPk.toBase58() && lamports > 0n) {
            sum += lamports;
          }
        }

        if (sum <= 0n) {
          return json({ error: "No matching SOL transfer found to escrow" }, { status: 400 });
        }
        if (sum !== expectedAmount) {
          return json(
            {
              error: "Funding amount mismatch",
              declaredLamports: expectedAmount.toString(),
              onchainLamports: sum.toString(),
            },
            { status: 400 }
          );
        }
      } else {
        const rewardMint = String(campaign.rewardMint ?? "").trim();
        if (!rewardMint) {
          return json({ error: "Reward mint not configured" }, { status: 400 });
        }

        let mintPk: PublicKey;
        try {
          mintPk = new PublicKey(rewardMint);
        } catch {
          return json({ error: "Invalid reward mint" }, { status: 400 });
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
          if (authority !== projectPk.toBase58()) continue;
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
          return json({ error: "No matching SPL token transfer found to escrow" }, { status: 400 });
        }
        if (sum !== expectedAmount) {
          return json(
            {
              error: "Funding amount mismatch",
              declaredAmountRaw: expectedAmount.toString(),
              onchainAmountRaw: sum.toString(),
            },
            { status: 400 }
          );
        }
      }

      const pool = getPool();
      await pool.query(
        `UPDATE public.campaigns
         SET status = 'active', updated_at_unix = $2
         WHERE id = $1`,
        [campaignId, nowUnix]
      );

      const epochsExist = await pool.query(
        `SELECT id FROM public.epochs WHERE campaign_id = $1 LIMIT 1`,
        [campaignId]
      );
      if (!epochsExist.rows?.length) {
        await createEpochsForCampaign({ ...campaign, status: "active", updatedAtUnix: nowUnix });
      }

      return json({
        campaign: {
          ...campaign,
          status: "active",
          updatedAtUnix: nowUnix,
          totalFeeLamports: campaign.totalFeeLamports.toString(),
          platformFeeLamports: campaign.platformFeeLamports.toString(),
          rewardPoolLamports: campaign.rewardPoolLamports.toString(),
          minTokenBalance: campaign.minTokenBalance.toString(),
        },
      });
    }

    const {
      projectPubkey,
      tokenMint,
      name,
      description,
      totalFeeLamports,
      startAtUnix,
      endAtUnix,
      epochDurationSeconds,
      minTokenBalance,
      weightLikeBps,
      weightRetweetBps,
      weightReplyBps,
      weightQuoteBps,
      trackingHandles,
      trackingHashtags,
      trackingUrls,
      signature,
      timestamp,
      // Manual lock-up fields
      isManualLockup,
      rewardAssetType,
      rewardMint,
      rewardDecimals,
    } = body;

    // Validate required fields
    const isManualLockupMode = Boolean(isManualLockup);
    if (!projectPubkey || !tokenMint || !name || !startAtUnix || !endAtUnix) {
      return json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }
    if (!totalFeeLamports) {
      return json(
        { error: "totalFeeLamports required for campaign funding" },
        { status: 400 }
      );
    }

    let totalFeeLamportsBig: bigint;
    try {
      totalFeeLamportsBig = BigInt(String(totalFeeLamports));
    } catch {
      return json({ error: "Invalid totalFeeLamports" }, { status: 400 });
    }
    if (totalFeeLamportsBig < 0n) {
      return json({ error: "totalFeeLamports must be greater than or equal to 0" }, { status: 400 });
    }

    // Validate tracking configuration
    const hasTracking = 
      (trackingHandles?.length > 0) || 
      (trackingHashtags?.length > 0) || 
      (trackingUrls?.length > 0);
    
    if (!hasTracking) {
      return json(
        { error: "Campaign must have at least one tracking handle, hashtag, or URL" },
        { status: 400 }
      );
    }

    // Validate timestamp is recent
    const timestampUnix = parseInt(timestamp, 10);
    const nowUnix = Math.floor(Date.now() / 1000);
    if (Math.abs(nowUnix - timestampUnix) > 300) {
      return json(
        { error: "Signature timestamp expired" },
        { status: 400 }
      );
    }

    // TODO: Verify wallet signature
    // For production, verify signature using tweetnacl

    let projectPk: PublicKey;
    let mintPk: PublicKey;
    try {
      projectPk = new PublicKey(String(projectPubkey));
      mintPk = new PublicKey(String(tokenMint));
    } catch {
      return json({ error: "Invalid projectPubkey or tokenMint" }, { status: 400 });
    }

    let sigBytes: Uint8Array;
    try {
      sigBytes = bs58.decode(String(signature));
    } catch {
      return json({ error: "Invalid signature encoding" }, { status: 400 });
    }

    const msg = `AmpliFi\nCreate Campaign\nProject: ${projectPk.toBase58()}\nToken: ${mintPk.toBase58()}\nTimestamp: ${timestampUnix}`;
    const ok = nacl.sign.detached.verify(new TextEncoder().encode(msg), sigBytes, projectPk.toBytes());
    if (!ok) {
      return json({ error: "Invalid signature" }, { status: 401 });
    }

    // For manual lock-ups, enforce per-project verification
    if (isManualLockupMode) {
      const pool = getPool();
      const reg = await pool.query(
        `select creator_pubkey
         from public.project_profiles
         where token_mint=$1
         limit 1`,
        [tokenMint]
      );
      const creatorPubkey = String(reg.rows?.[0]?.creator_pubkey ?? "").trim();
      if (!creatorPubkey) {
        return json(
          { error: "Project must be registered before creating a manual-lockup campaign" },
          { status: 403 }
        );
      }
      if (creatorPubkey !== projectPk.toBase58()) {
        return json(
          { error: "Project wallet does not match registered project owner" },
          { status: 403 }
        );
      }
    }

    if (isManualLockupMode && totalFeeLamportsBig === 0n) {
      const campaign = await createCampaign({
        projectPubkey,
        tokenMint,
        name,
        description,
        totalFeeLamports: 0n,
        startAtUnix,
        endAtUnix,
        epochDurationSeconds,
        minTokenBalance: minTokenBalance ? BigInt(minTokenBalance) : undefined,
        weightLikeBps,
        weightRetweetBps,
        weightReplyBps,
        weightQuoteBps,
        trackingHandles,
        trackingHashtags,
        trackingUrls,
        isManualLockup: true,
        rewardAssetType: rewardAssetType || "sol",
        rewardMint: rewardMint || undefined,
        rewardDecimals: rewardDecimals ? Number(rewardDecimals) : undefined,
        status: "active",
        createEpochs: true,
      });

      return json({
        stage: "prepare",
        campaign: {
          ...campaign,
          totalFeeLamports: campaign.totalFeeLamports.toString(),
          platformFeeLamports: campaign.platformFeeLamports.toString(),
          rewardPoolLamports: campaign.rewardPoolLamports.toString(),
          minTokenBalance: campaign.minTokenBalance.toString(),
        },
        escrowWallet: null,
        txBase64: null,
        txFormat: null,
        blockhash: null,
        lastValidBlockHeight: null,
      });
    }

    const campaign = await createCampaign({
      projectPubkey,
      tokenMint,
      name,
      description,
      totalFeeLamports: totalFeeLamportsBig,
      startAtUnix,
      endAtUnix,
      epochDurationSeconds,
      minTokenBalance: minTokenBalance ? BigInt(minTokenBalance) : undefined,
      weightLikeBps,
      weightRetweetBps,
      weightReplyBps,
      weightQuoteBps,
      trackingHandles,
      trackingHashtags,
      trackingUrls,
      // Manual lock-up fields
      isManualLockup: Boolean(isManualLockup),
      rewardAssetType: rewardAssetType || "sol",
      rewardMint: rewardMint || undefined,
      rewardDecimals: rewardDecimals ? Number(rewardDecimals) : undefined,
      status: "pending",
      createEpochs: false,
    });

    // Create a dedicated escrow wallet for the campaign
    let escrowWallet: { walletPubkey: string; privyWalletId: string } | null = null;
    try {
      const escrow = await createCampaignEscrowWallet(campaign.id);
      escrowWallet = {
        walletPubkey: escrow.walletPubkey,
        privyWalletId: escrow.privyWalletId,
      };
    } catch (escrowErr) {
      console.error("Failed to create escrow wallet:", escrowErr);
      return json({ error: "Failed to create escrow wallet" }, { status: 500 });
    }

    const connection = getConnection();
    const latest = await connection.getLatestBlockhash("confirmed");
    const blockhash = latest.blockhash;
    const lastValidBlockHeight = latest.lastValidBlockHeight;
    const tx = new Transaction();
    tx.feePayer = projectPk;
    tx.recentBlockhash = blockhash;
    tx.lastValidBlockHeight = lastValidBlockHeight;

    if (campaign.rewardPoolLamports <= 0n) {
      return json({ error: "Reward pool must be greater than 0" }, { status: 400 });
    }

    if (campaign.rewardAssetType === "sol") {
      const lamports = requireSafeLamportsNumber(campaign.rewardPoolLamports, "Reward pool amount");
      tx.add(
        SystemProgram.transfer({
          fromPubkey: projectPk,
          toPubkey: new PublicKey(escrowWallet.walletPubkey),
          lamports,
        })
      );
    } else {
      const mintValue = String(campaign.rewardMint ?? "").trim();
      if (!mintValue) {
        return json({ error: "Reward mint required for SPL rewards" }, { status: 400 });
      }
      const mintPk = new PublicKey(mintValue);
      const escrowPk = new PublicKey(escrowWallet.walletPubkey);
      const tokenProgram = await getTokenProgramIdForMint({ connection, mint: mintPk });
      const sourceAta = getAssociatedTokenAddress({ owner: projectPk, mint: mintPk, tokenProgram });
      const { ix: createAtaIx, ata: destinationAta } = buildCreateAssociatedTokenAccountIdempotentInstruction({
        payer: projectPk,
        owner: escrowPk,
        mint: mintPk,
        tokenProgram,
      });
      const transferIx = buildSplTokenTransferInstruction({
        sourceAta,
        destinationAta,
        owner: projectPk,
        amountRaw: campaign.rewardPoolLamports,
        tokenProgram,
      });
      tx.add(createAtaIx);
      tx.add(transferIx);
    }

    const txBytes = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
    const txBase64 = Buffer.from(Uint8Array.from(txBytes)).toString("base64");

    return json({
      stage: "prepare",
      campaign: {
        ...campaign,
        totalFeeLamports: campaign.totalFeeLamports.toString(),
        platformFeeLamports: campaign.platformFeeLamports.toString(),
        rewardPoolLamports: campaign.rewardPoolLamports.toString(),
        minTokenBalance: campaign.minTokenBalance.toString(),
      },
      escrowWallet,
      txBase64,
      txFormat: "base64",
      blockhash,
      lastValidBlockHeight,
    });
  } catch (error) {
    console.error("Failed to create campaign:", error);
    return json({ error: "Failed to create campaign" }, { status: 500 });
  }
}

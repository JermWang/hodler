import { NextRequest, NextResponse } from "next/server";
import { getActiveCampaigns, createCampaign } from "@/app/lib/campaignStore";
import { hasDatabase, getPool } from "@/app/lib/db";
import { createCampaignEscrowWallet } from "@/app/lib/campaignEscrow";
import { getProjectProfilesByTokenMints } from "@/app/lib/projectProfilesStore";
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";

/**
 * GET /api/campaigns
 * 
 * List active campaigns
 */
export async function GET(req: NextRequest) {
  try {
    if (!hasDatabase()) {
      return NextResponse.json(
        { error: "Database not available" },
        { status: 503 }
      );
    }

    const campaigns = await getActiveCampaigns();

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

    return NextResponse.json({ campaigns: serializedCampaigns });
  } catch (error) {
    console.error("Failed to fetch campaigns:", error);
    return NextResponse.json(
      { error: "Failed to fetch campaigns" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/campaigns
 * 
 * Create a new campaign (requires project wallet signature)
 */
export async function POST(req: NextRequest) {
  try {
    if (!hasDatabase()) {
      return NextResponse.json(
        { error: "Database not available" },
        { status: 503 }
      );
    }

    const body = await req.json();
    
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
    // For manual lockups, totalFeeLamports can start at 0 (deposits come later)
    const isManualLockupMode = Boolean(isManualLockup);
    if (!projectPubkey || !tokenMint || !name || !startAtUnix || !endAtUnix) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }
    if (!isManualLockupMode && !totalFeeLamports) {
      return NextResponse.json(
        { error: "totalFeeLamports required for non-manual-lockup campaigns" },
        { status: 400 }
      );
    }

    // Validate tracking configuration
    const hasTracking = 
      (trackingHandles?.length > 0) || 
      (trackingHashtags?.length > 0) || 
      (trackingUrls?.length > 0);
    
    if (!hasTracking) {
      return NextResponse.json(
        { error: "Campaign must have at least one tracking handle, hashtag, or URL" },
        { status: 400 }
      );
    }

    // Validate timestamp is recent
    const timestampUnix = parseInt(timestamp, 10);
    const nowUnix = Math.floor(Date.now() / 1000);
    if (Math.abs(nowUnix - timestampUnix) > 300) {
      return NextResponse.json(
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
      return NextResponse.json({ error: "Invalid projectPubkey or tokenMint" }, { status: 400 });
    }

    let sigBytes: Uint8Array;
    try {
      sigBytes = bs58.decode(String(signature));
    } catch {
      return NextResponse.json({ error: "Invalid signature encoding" }, { status: 400 });
    }

    const msg = `AmpliFi\nCreate Campaign\nProject: ${projectPk.toBase58()}\nToken: ${mintPk.toBase58()}\nTimestamp: ${timestampUnix}`;
    const ok = nacl.sign.detached.verify(new TextEncoder().encode(msg), sigBytes, projectPk.toBytes());
    if (!ok) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
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
        return NextResponse.json(
          { error: "Project must be registered before creating a manual-lockup campaign" },
          { status: 403 }
        );
      }
      if (creatorPubkey !== projectPk.toBase58()) {
        return NextResponse.json(
          { error: "Project wallet does not match registered project owner" },
          { status: 403 }
        );
      }
    }

    const campaign = await createCampaign({
      projectPubkey,
      tokenMint,
      name,
      description,
      totalFeeLamports: BigInt(totalFeeLamports || "0"),
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
    });

    // For manual-lockup campaigns, create a dedicated escrow wallet
    let escrowWallet: { walletPubkey: string; privyWalletId: string } | null = null;
    if (campaign.isManualLockup) {
      try {
        const escrow = await createCampaignEscrowWallet(campaign.id);
        escrowWallet = {
          walletPubkey: escrow.walletPubkey,
          privyWalletId: escrow.privyWalletId,
        };
      } catch (escrowErr) {
        console.error("Failed to create escrow wallet:", escrowErr);
        // Campaign is created, but escrow failed - this is a partial failure
        // The escrow can be created later via a retry mechanism
      }
    }

    return NextResponse.json({
      campaign: {
        ...campaign,
        totalFeeLamports: campaign.totalFeeLamports.toString(),
        platformFeeLamports: campaign.platformFeeLamports.toString(),
        rewardPoolLamports: campaign.rewardPoolLamports.toString(),
        minTokenBalance: campaign.minTokenBalance.toString(),
      },
      escrowWallet,
    });
  } catch (error) {
    console.error("Failed to create campaign:", error);
    return NextResponse.json(
      { error: "Failed to create campaign" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getActiveCampaigns, createCampaign } from "@/app/lib/campaignStore";
import { hasDatabase } from "@/app/lib/db";
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

    // Convert BigInt to string for JSON serialization
    const serializedCampaigns = campaigns.map((c) => ({
      ...c,
      totalFeeLamports: c.totalFeeLamports.toString(),
      platformFeeLamports: c.platformFeeLamports.toString(),
      rewardPoolLamports: c.rewardPoolLamports.toString(),
      minTokenBalance: c.minTokenBalance.toString(),
    }));

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
    } = body;

    // Validate required fields
    if (!projectPubkey || !tokenMint || !name || !totalFeeLamports || !startAtUnix || !endAtUnix) {
      return NextResponse.json(
        { error: "Missing required fields" },
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

    const campaign = await createCampaign({
      projectPubkey,
      tokenMint,
      name,
      description,
      totalFeeLamports: BigInt(totalFeeLamports),
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
    });

    return NextResponse.json({
      campaign: {
        ...campaign,
        totalFeeLamports: campaign.totalFeeLamports.toString(),
        platformFeeLamports: campaign.platformFeeLamports.toString(),
        rewardPoolLamports: campaign.rewardPoolLamports.toString(),
        minTokenBalance: campaign.minTokenBalance.toString(),
      },
    });
  } catch (error) {
    console.error("Failed to create campaign:", error);
    return NextResponse.json(
      { error: "Failed to create campaign" },
      { status: 500 }
    );
  }
}

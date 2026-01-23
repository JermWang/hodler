import { NextRequest, NextResponse } from "next/server";
import { getCampaignById, addCampaignParticipant } from "@/app/lib/campaignStore";
import { hasDatabase, getPool } from "@/app/lib/db";
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { getConnection, getTokenBalanceForMint } from "@/app/lib/solana";
import { getVerifiedStatusForTwitterUserIds } from "@/app/lib/twitterInfluenceStore";

/**
 * POST /api/campaigns/[id]/join
 * 
 * Join a campaign as a holder
 * Requires wallet signature and verified Twitter account
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (!hasDatabase()) {
      return NextResponse.json(
        { error: "Database not available" },
        { status: 503 }
      );
    }

    const body = await req.json();
    const { walletPubkey, signature, timestamp } = body;

    if (!walletPubkey || !signature || !timestamp) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Validate timestamp
    const timestampUnix = parseInt(timestamp, 10);
    const nowUnix = Math.floor(Date.now() / 1000);
    if (Math.abs(nowUnix - timestampUnix) > 300) {
      return NextResponse.json(
        { error: "Signature timestamp expired" },
        { status: 400 }
      );
    }

    let walletPk: PublicKey;
    try {
      walletPk = new PublicKey(String(walletPubkey));
    } catch {
      return NextResponse.json({ error: "Invalid walletPubkey" }, { status: 400 });
    }

    let sigBytes: Uint8Array;
    try {
      sigBytes = bs58.decode(String(signature));
    } catch {
      return NextResponse.json({ error: "Invalid signature encoding" }, { status: 400 });
    }

    const expectedMessage = `AmpliFi\nJoin Campaign\nCampaign: ${params.id}\nWallet: ${walletPk.toBase58()}\nTimestamp: ${timestampUnix}`;
    const okSig = nacl.sign.detached.verify(new TextEncoder().encode(expectedMessage), sigBytes, walletPk.toBytes());
    if (!okSig) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // Get campaign
    const campaign = await getCampaignById(params.id);
    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    // Check campaign is active
    if (campaign.status !== "active") {
      return NextResponse.json(
        { error: "Campaign is not active" },
        { status: 400 }
      );
    }

    // Check campaign timing
    if (nowUnix < campaign.startAtUnix) {
      return NextResponse.json(
        { error: "Campaign has not started yet" },
        { status: 400 }
      );
    }

    if (nowUnix >= campaign.endAtUnix) {
      return NextResponse.json(
        { error: "Campaign has ended" },
        { status: 400 }
      );
    }

    // Check holder has verified Twitter
    const pool = getPool();
    const registrationResult = await pool.query(
      `SELECT id, twitter_username, twitter_user_id FROM public.holder_registrations 
       WHERE wallet_pubkey = $1 AND status = 'active'`,
      [walletPubkey]
    );

    if (registrationResult.rows.length === 0) {
      return NextResponse.json(
        { error: "Twitter account not verified. Please connect your Twitter first." },
        { status: 400 }
      );
    }

    const registration = registrationResult.rows[0];

    // Require verified X account (Twitter Blue/Premium)
    const bearerToken = process.env.TWITTER_BEARER_TOKEN;
    if (!bearerToken) {
      return NextResponse.json(
        { error: "Twitter API not configured" },
        { status: 503 }
      );
    }

    const twitterUserId = String((registration as any)?.twitter_user_id ?? "").trim();
    if (!twitterUserId) {
      return NextResponse.json(
        { error: "Twitter account not verified. Please connect your Twitter first." },
        { status: 400 }
      );
    }

    // Prefer cache to avoid false negatives when we cannot call Twitter
    const ttlSeconds = Math.max(3600, Number(process.env.TWITTER_INFLUENCE_CACHE_TTL_SECONDS ?? 7 * 86400) || 7 * 86400);
    let isVerified = false;
    let cachedVerified: boolean | null = null;
    let cachedFetchedAtUnix = 0;
    let cacheFresh = false;
    try {
      const cacheRes = await pool.query(
        `select verified, fetched_at_unix
         from public.twitter_user_influence_cache
         where twitter_user_id = $1
         limit 1`,
        [twitterUserId]
      );
      cachedVerified = cacheRes.rows?.[0]?.verified ?? null;
      cachedFetchedAtUnix = Number(cacheRes.rows?.[0]?.fetched_at_unix ?? 0) || 0;
      cacheFresh = cachedFetchedAtUnix > nowUnix - ttlSeconds;
      if (cachedVerified === true && cacheFresh) isVerified = true;
    } catch {
    }

    if (!isVerified) {
      const verifiedMap = await getVerifiedStatusForTwitterUserIds({
        twitterUserIds: [twitterUserId],
        bearerToken,
        forceRefresh: cachedVerified !== true || !cacheFresh,
      });
      isVerified = verifiedMap.get(twitterUserId) ?? false;
    }
    if (!isVerified) {
      let updatedVerified: boolean | null = null;
      let updatedFetchedAtUnix = 0;
      try {
        const cacheRes = await pool.query(
          `select verified, fetched_at_unix
           from public.twitter_user_influence_cache
           where twitter_user_id = $1
           limit 1`,
          [twitterUserId]
        );
        updatedVerified = cacheRes.rows?.[0]?.verified ?? null;
        updatedFetchedAtUnix = Number(cacheRes.rows?.[0]?.fetched_at_unix ?? 0) || 0;
        const refreshed = updatedFetchedAtUnix > cachedFetchedAtUnix;
        if (refreshed && updatedVerified === false) {
          return NextResponse.json(
            { error: "X account must be verified to join this campaign" },
            { status: 403 }
          );
        }
        if (refreshed && updatedVerified === true) {
          isVerified = true;
        }
      } catch {
      }

      if (isVerified) {
        // continue
      } else {
        return NextResponse.json(
          { error: "Unable to verify X account right now. Please try again soon." },
          { status: 503 }
        );
      }
    }

    // Verify token balance on-chain (do not trust client-provided balance)
    let tokenBalanceBigInt = 0n;
    try {
      const mintPk = new PublicKey(String(campaign.tokenMint));
      const connection = getConnection();
      const bal = await getTokenBalanceForMint({ connection, owner: walletPk, mint: mintPk });
      tokenBalanceBigInt = bal.amountRaw;
    } catch {
      return NextResponse.json({ error: "Failed to verify token balance" }, { status: 503 });
    }

    const minRequired = campaign.minTokenBalance > 0n ? campaign.minTokenBalance : 1n;
    if (tokenBalanceBigInt < minRequired) {
      return NextResponse.json(
        { 
          error: `Insufficient token balance. Minimum required: ${minRequired.toString()}`,
          minRequired: minRequired.toString(),
          current: tokenBalanceBigInt.toString(),
        },
        { status: 400 }
      );
    }

    // Add participant
    await addCampaignParticipant({
      campaignId: params.id,
      walletPubkey: walletPk.toBase58(),
      registrationId: registration.id,
      tokenBalanceSnapshot: tokenBalanceBigInt,
    });

    return NextResponse.json({
      success: true,
      message: "Successfully joined campaign",
      twitterUsername: registration.twitter_username,
    });
  } catch (error) {
    console.error("Failed to join campaign:", error);
    return NextResponse.json(
      { error: "Failed to join campaign" },
      { status: 500 }
    );
  }
}

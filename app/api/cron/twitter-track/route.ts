import { NextRequest, NextResponse } from "next/server";
import { getPool, hasDatabase } from "@/app/lib/db";
import { getActiveCampaigns, getCurrentEpoch, recordEngagementEvent, getHolderEngagementHistory } from "@/app/lib/campaignStore";
import { calculateEngagementScore } from "@/app/lib/engagementScoring";
import { getTweetType, tweetReferencesCampaign, TwitterTweet } from "@/app/lib/twitter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function sanitizeHandle(raw: string): string | null {
  const v = String(raw ?? "").trim().replace(/^@+/, "");
  if (!v) return null;
  if (!/^[A-Za-z0-9_]{1,15}$/.test(v)) return null;
  return v;
}

export async function GET(req: NextRequest) {
  return POST(req);
}

export async function HEAD(req: NextRequest) {
  return new NextResponse(null, { status: 200 });
}

function sanitizeHashtag(raw: string): string | null {
  const v = String(raw ?? "").trim().replace(/^#+/, "");
  if (!v) return null;
  if (!/^[A-Za-z0-9_]{1,100}$/.test(v)) return null;
  return v;
}

/**
 * POST /api/cron/twitter-track
 * 
 * Polls Twitter API for engagement on active campaigns.
 * Should be called every 15 minutes by external cron.
 * 
 * Requires CRON_SECRET header for authentication.
 */
export async function POST(req: NextRequest) {
  try {
    // Verify cron secret
    const cronSecret = req.headers.get("x-cron-secret");
    const authHeader = req.headers.get("authorization");
    const expectedSecret = process.env.CRON_SECRET;

    const ok =
      Boolean(expectedSecret) &&
      (cronSecret === expectedSecret || authHeader === `Bearer ${expectedSecret}`);

    if (!ok) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    if (!hasDatabase()) {
      return NextResponse.json(
        { error: "Database not available" },
        { status: 503 }
      );
    }

    const bearerToken = process.env.TWITTER_BEARER_TOKEN;
    if (!bearerToken) {
      return NextResponse.json(
        { error: "Twitter API not configured" },
        { status: 503 }
      );
    }

    // Get all active campaigns
    const campaigns = await getActiveCampaigns();
    
    if (campaigns.length === 0) {
      return NextResponse.json({ message: "No active campaigns", processed: 0 });
    }

    const results: Array<{
      campaignId: string;
      campaignName: string;
      tweetsFound: number;
      engagementsRecorded: number;
      errors: string[];
    }> = [];

    const walletByTwitterUserId = new Map<string, string | null>();
    const participantByCampaignWallet = new Map<string, { registrationId: string; tokenBalanceSnapshot: bigint } | null>();
    const engagementsByCampaignWalletEpoch = new Map<string, Awaited<ReturnType<typeof getHolderEngagementHistory>>>();

    for (const campaign of campaigns) {
      const campaignResult = {
        campaignId: campaign.id,
        campaignName: campaign.name,
        tweetsFound: 0,
        engagementsRecorded: 0,
        errors: [] as string[],
      };

      try {
        // Get current epoch for this campaign
        const epoch = await getCurrentEpoch(campaign.id);
        if (!epoch) {
          campaignResult.errors.push("No active epoch");
          results.push(campaignResult);
          continue;
        }

        // Build search query from tracking config
        const queryParts: string[] = [];

        const sanitizedHandles = campaign.trackingHandles.map(sanitizeHandle).filter((v): v is string => Boolean(v)).slice(0, 10);
        const sanitizedHashtags = campaign.trackingHashtags.map(sanitizeHashtag).filter((v): v is string => Boolean(v)).slice(0, 10);

        for (const handle of sanitizedHandles) {
          queryParts.push(`"@${handle}"`);
        }
        for (const hashtag of sanitizedHashtags) {
          queryParts.push(`"#${hashtag}"`);
        }
        
        if (queryParts.length === 0) {
          campaignResult.errors.push("No tracking handles or hashtags configured");
          results.push(campaignResult);
          continue;
        }

        // Search for tweets (last 15 minutes to match cron interval)
        const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
        const query = `(${queryParts.join(" OR ")}) -is:retweet`;
        
        const { tweets } = await searchTweetsWithBearerToken(
          bearerToken,
          query,
          { startTime: fifteenMinutesAgo, maxResults: 100 }
        );

        campaignResult.tweetsFound = tweets.length;

        // Process each tweet
        for (const tweet of tweets) {
          try {
            // Check if tweet references campaign
            const reference = tweetReferencesCampaign(tweet, sanitizedHandles, sanitizedHashtags, campaign.trackingUrls);

            if (!reference.matches) continue;

            // Look up wallet for this Twitter user
            let walletPubkey = walletByTwitterUserId.get(tweet.author_id);
            if (walletPubkey === undefined) {
              walletPubkey = await getWalletForTwitterUser(tweet.author_id);
              walletByTwitterUserId.set(tweet.author_id, walletPubkey);
            }
            if (!walletPubkey) continue; // User not registered

            // Check if user is a campaign participant
            const participantKey = `${campaign.id}:${walletPubkey}`;
            let participant = participantByCampaignWallet.get(participantKey);
            if (participant === undefined) {
              participant = await getCampaignParticipant(campaign.id, walletPubkey);
              participantByCampaignWallet.set(participantKey, participant);
            }
            if (!participant) continue; // Not a participant

            // Get previous engagements for scoring context
            const engagementsKey = `${campaign.id}:${walletPubkey}:${epoch.id}`;
            let previousEngagements = engagementsByCampaignWalletEpoch.get(engagementsKey);
            if (!previousEngagements) {
              previousEngagements = await getHolderEngagementHistory(campaign.id, walletPubkey, epoch.id);
              engagementsByCampaignWalletEpoch.set(engagementsKey, previousEngagements);
            }

            // Calculate engagement score
            const scoringResult = calculateEngagementScore(tweet, {
              weights: {
                likeBps: campaign.weightLikeBps,
                retweetBps: campaign.weightRetweetBps,
                replyBps: campaign.weightReplyBps,
                quoteBps: campaign.weightQuoteBps,
              },
              holderTokenBalance: participant.tokenBalanceSnapshot,
              totalTokenSupply: 1000000000n * 1000000n, // 1B tokens with 6 decimals - would fetch on-chain
              previousEngagements: previousEngagements.map(e => ({
                tweetId: e.tweetId,
                tweetText: e.tweetText || "",
                tweetType: e.tweetType,
                createdAtUnix: e.createdAtUnix,
                finalScore: e.finalScore,
              })),
              epochStartUnix: epoch.startAtUnix,
              epochEndUnix: epoch.endAtUnix,
            });

            // Record engagement event
            await recordEngagementEvent({
              campaignId: campaign.id,
              epochId: epoch.id,
              walletPubkey,
              registrationId: participant.registrationId,
              tweetId: tweet.id,
              tweetType: getTweetType(tweet),
              tweetText: tweet.text,
              tweetCreatedAtUnix: Math.floor(new Date(tweet.created_at).getTime() / 1000),
              referencedHandle: reference.matchedHandle,
              referencedHashtag: reference.matchedHashtag,
              referencedUrl: reference.matchedUrl,
              parentTweetId: tweet.referenced_tweets?.[0]?.id,
              basePoints: scoringResult.basePoints,
              balanceWeight: scoringResult.balanceWeight,
              timeConsistencyBonus: scoringResult.timeConsistencyBonus,
              antiSpamDampener: scoringResult.antiSpamDampener,
              finalScore: scoringResult.finalScore,
              isDuplicate: scoringResult.isDuplicate,
              isSpam: scoringResult.isSpam,
              spamReason: scoringResult.spamReason,
              createdAtUnix: Math.floor(Date.now() / 1000),
            });

            campaignResult.engagementsRecorded++;
          } catch (tweetError) {
            campaignResult.errors.push(`Tweet ${tweet.id}: ${String(tweetError)}`);
          }
        }
      } catch (campaignError) {
        campaignResult.errors.push(String(campaignError));
      }

      results.push(campaignResult);
    }

    const totalEngagements = results.reduce((sum, r) => sum + r.engagementsRecorded, 0);
    const totalTweets = results.reduce((sum, r) => sum + r.tweetsFound, 0);

    return NextResponse.json({
      success: true,
      campaignsProcessed: campaigns.length,
      totalTweetsFound: totalTweets,
      totalEngagementsRecorded: totalEngagements,
      results,
    });
  } catch (error) {
    console.error("Twitter tracking cron failed:", error);
    return NextResponse.json(
      { error: "Twitter tracking failed", details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * Search tweets using Bearer Token (app-only auth)
 */
async function searchTweetsWithBearerToken(
  bearerToken: string,
  query: string,
  options: { startTime?: string; maxResults?: number } = {}
): Promise<{ tweets: TwitterTweet[] }> {
  const params = new URLSearchParams({
    query,
    "tweet.fields": "created_at,public_metrics,referenced_tweets,entities,author_id",
    max_results: String(options.maxResults || 100),
  });

  if (options.startTime) {
    params.set("start_time", options.startTime);
  }

  const response = await fetch(
    `https://api.twitter.com/2/tweets/search/recent?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${bearerToken}`,
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Twitter search failed: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return { tweets: data.data || [] };
}

/**
 * Look up wallet pubkey for a Twitter user ID
 */
async function getWalletForTwitterUser(twitterUserId: string): Promise<string | null> {
  if (!hasDatabase()) return null;
  
  const pool = getPool();
  const result = await pool.query(
    `SELECT wallet_pubkey FROM public.holder_registrations WHERE twitter_user_id = $1 AND status = 'active'`,
    [twitterUserId]
  );

  return result.rows[0]?.wallet_pubkey || null;
}

/**
 * Get campaign participant by wallet
 */
async function getCampaignParticipant(
  campaignId: string,
  walletPubkey: string
): Promise<{ registrationId: string; tokenBalanceSnapshot: bigint } | null> {
  if (!hasDatabase()) return null;
  
  const pool = getPool();
  const result = await pool.query(
    `SELECT registration_id, token_balance_snapshot 
     FROM public.campaign_participants 
     WHERE campaign_id = $1 AND wallet_pubkey = $2 AND status = 'active'`,
    [campaignId, walletPubkey]
  );

  if (result.rows.length === 0) return null;

  return {
    registrationId: result.rows[0].registration_id,
    tokenBalanceSnapshot: BigInt(result.rows[0].token_balance_snapshot || "0"),
  };
}

import { NextRequest, NextResponse } from "next/server";
import { getPool, hasDatabase } from "@/app/lib/db";
import { getActiveCampaigns, getCurrentEpoch, recordEngagementEvent, getHolderEngagementHistory } from "@/app/lib/campaignStore";
import { calculateEngagementScore } from "@/app/lib/engagementScoring";
import { getTweetType, tweetReferencesCampaign, TwitterTweet } from "@/app/lib/twitter";
import { getInfluenceMultipliersForTwitterUserIds, getVerifiedStatusForTwitterUserIds } from "@/app/lib/twitterInfluenceStore";
import { 
  incrementApiUsage, 
  getBudgetStatus,
  calculateOptimalBatchSize,
  getDaysRemainingInMonth
} from "@/app/lib/twitterRateLimit";

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

function sanitizeTag(raw: string): { kind: "hashtag" | "cashtag"; value: string } | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const kind = s.startsWith("$") ? "cashtag" : "hashtag";
  const v = s.replace(/^[#$]+/, "");
  if (!v) return null;
  if (!/^[A-Za-z0-9_]{1,100}$/.test(v)) return null;
  return { kind, value: v };
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

    const trackingEnabledRaw = String(process.env.TWITTER_TRACKING_ENABLED ?? "true").trim().toLowerCase();
    const trackingEnabled = trackingEnabledRaw !== "0" && trackingEnabledRaw !== "false" && trackingEnabledRaw !== "no" && trackingEnabledRaw !== "off";
    if (!trackingEnabled) {
      return NextResponse.json({ message: "Twitter tracking disabled", processed: 0 });
    }

    // Check API budget before proceeding
    const budgetStatus = await getBudgetStatus();
    if (budgetStatus.posts.isBlocked) {
      console.warn("[twitter-track] Monthly API budget exhausted, skipping tracking");
      return NextResponse.json({
        error: "Monthly Twitter API budget exhausted",
        budgetStatus: {
          postsUsed: budgetStatus.posts.currentCount,
          postsLimit: budgetStatus.posts.monthlyLimit,
          resetDate: budgetStatus.posts.resetDate.toISOString(),
        },
      }, { status: 429 });
    }

    // Get all active campaigns
    const campaigns = await getActiveCampaigns();
    
    if (campaigns.length === 0) {
      return NextResponse.json({ message: "No active campaigns", processed: 0 });
    }

    // Calculate optimal batch size based on remaining budget
    const daysRemaining = getDaysRemainingInMonth();
    const optimalBatchSize = calculateOptimalBatchSize(
      budgetStatus.posts.remainingBudget,
      daysRemaining,
      campaigns.length
    );

    // Limit API calls per cron run to stay within budget
    const maxApiCallsThisRun = Math.min(
      campaigns.length * 2, // Max 2 calls per campaign
      Math.ceil(budgetStatus.posts.remainingBudget / (daysRemaining * 4)) // Spread across ~4 runs per day
    );
    let apiCallsThisRun = 0;

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
        const hasParticipants = await hasAnyActiveParticipants(campaign.id);
        if (!hasParticipants) {
          campaignResult.errors.push("Skipped: no active participants");
          results.push(campaignResult);
          continue;
        }

        const participantHandleLimit = Math.max(1, Math.min(50, Number(process.env.TWITTER_CRON_PARTICIPANT_HANDLE_LIMIT ?? 20) || 20));
        const participantHandles = await getActiveParticipantTwitterHandles({ campaignId: campaign.id, limit: participantHandleLimit });
        if (participantHandles.length === 0) {
          campaignResult.errors.push("Skipped: participants missing twitter handles");
          results.push(campaignResult);
          continue;
        }

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
        const sanitizedTags = campaign.trackingHashtags
          .map(sanitizeTag)
          .filter((v): v is { kind: "hashtag" | "cashtag"; value: string } => Boolean(v))
          .slice(0, 10);

        for (const handle of sanitizedHandles) {
          queryParts.push(`"@${handle}"`);
        }
        for (const tag of sanitizedTags) {
          queryParts.push(`"${tag.kind === "cashtag" ? "$" : "#"}${tag.value}"`);
        }
        
        if (queryParts.length === 0) {
          campaignResult.errors.push("No tracking handles or tags configured");
          results.push(campaignResult);
          continue;
        }

        // Check if we've hit our per-run API limit
        if (apiCallsThisRun >= maxApiCallsThisRun) {
          campaignResult.errors.push("Skipped: API budget limit for this run reached");
          results.push(campaignResult);
          continue;
        }

        // Search for tweets (last 15 minutes to match cron interval)
        const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
        const fromParts = participantHandles.map((h) => `from:${h}`);
        const query = `(${queryParts.join(" OR ")}) (${fromParts.join(" OR ")})`;
        
        const maxResultsEnv = Math.max(10, Math.min(100, Number(process.env.TWITTER_CRON_MAX_RESULTS ?? 20) || 20));
        const maxResults = Math.min(maxResultsEnv, Math.min(100, optimalBatchSize * 10));

        let tweets: TwitterTweet[] = [];
        try {
          const r = await searchTweetsWithBearerToken(bearerToken, query, { startTime: fifteenMinutesAgo, maxResults });
          tweets = r.tweets;
        } catch (e: any) {
          const msg = String(e?.message ?? e);
          const monthlyCap = msg.includes("UsageCapExceeded") || msg.includes("usage-capped") || msg.includes("Usage cap exceeded") || msg.includes("Monthly product cap");
          if (monthlyCap) {
            return NextResponse.json(
              {
                error: "X API monthly usage cap exceeded. Tracking paused.",
                hint: "Purchase a top-up in the X developer portal or wait for the monthly reset.",
                details: msg,
              },
              { status: 429 }
            );
          }
          throw e;
        }

        // Track API usage
        apiCallsThisRun++;
        await incrementApiUsage("tweets/search", 1);

        campaignResult.tweetsFound = tweets.length;

        const tags = sanitizedTags.map((t) => `${t.kind === "cashtag" ? "$" : "#"}${t.value}`);

        const workItems: Array<{
          tweet: TwitterTweet;
          walletPubkey: string;
          participant: { registrationId: string; tokenBalanceSnapshot: bigint };
          previousEngagements: Awaited<ReturnType<typeof getHolderEngagementHistory>>;
          reference: ReturnType<typeof tweetReferencesCampaign>;
        }> = [];

        const authorIds: string[] = [];

        for (const tweet of tweets) {
          try {
            const reference = tweetReferencesCampaign(tweet, sanitizedHandles, tags, campaign.trackingUrls);
            if (!reference.matches) continue;

            // Look up wallet for this Twitter user
            let walletPubkey = walletByTwitterUserId.get(tweet.author_id);
            if (walletPubkey === undefined) {
              walletPubkey = await getWalletForTwitterUser(tweet.author_id);
              walletByTwitterUserId.set(tweet.author_id, walletPubkey);
            }
            if (!walletPubkey) continue;

            // Check if user is a campaign participant
            const participantKey = `${campaign.id}:${walletPubkey}`;
            let participant = participantByCampaignWallet.get(participantKey);
            if (participant === undefined) {
              participant = await getCampaignParticipant(campaign.id, walletPubkey);
              participantByCampaignWallet.set(participantKey, participant);
            }
            if (!participant) continue;

            // Get previous engagements for scoring context
            const engagementsKey = `${campaign.id}:${walletPubkey}:${epoch.id}`;
            let previousEngagements = engagementsByCampaignWalletEpoch.get(engagementsKey);
            if (!previousEngagements) {
              previousEngagements = await getHolderEngagementHistory(campaign.id, walletPubkey, epoch.id);
              engagementsByCampaignWalletEpoch.set(engagementsKey, previousEngagements);
            }

            workItems.push({
              tweet,
              walletPubkey,
              participant,
              previousEngagements,
              reference,
            });
            authorIds.push(tweet.author_id);
          } catch (tweetError) {
            campaignResult.errors.push(`Tweet ${tweet.id}: ${String(tweetError)}`);
          }
        }

        let influenceByAuthor = new Map<string, number>();
        let verifiedByAuthor = new Map<string, boolean>();
        try {
          influenceByAuthor = await getInfluenceMultipliersForTwitterUserIds({
            twitterUserIds: authorIds,
            bearerToken,
          });
          verifiedByAuthor = await getVerifiedStatusForTwitterUserIds({
            twitterUserIds: authorIds,
            bearerToken,
          });
        } catch {
          influenceByAuthor = new Map();
          verifiedByAuthor = new Map();
        }

        // Filter to only verified (Twitter Blue/Premium) users for reward eligibility
        // This prevents bot manipulation and ensures meaningful payouts
        const verifiedWorkItems = workItems.filter((item) => {
          const isVerified = verifiedByAuthor.get(item.tweet.author_id) ?? false;
          if (!isVerified) {
            campaignResult.errors.push(`Tweet ${item.tweet.id}: Skipped (unverified account)`);
          }
          return isVerified;
        });

        for (const item of verifiedWorkItems) {
          try {
            const influenceMultiplier = influenceByAuthor.get(item.tweet.author_id) ?? 1;

            const scoringResult = calculateEngagementScore(item.tweet, {
              weights: {
                likeBps: campaign.weightLikeBps,
                retweetBps: campaign.weightRetweetBps,
                replyBps: campaign.weightReplyBps,
                quoteBps: campaign.weightQuoteBps,
              },
              holderTokenBalance: item.participant.tokenBalanceSnapshot,
              totalTokenSupply: BigInt("1000000000000000"), // 1B tokens with 6 decimals - would fetch on-chain
              previousEngagements: item.previousEngagements.map((e) => ({
                tweetId: e.tweetId,
                tweetText: e.tweetText || "",
                tweetType: e.tweetType,
                createdAtUnix: e.createdAtUnix,
                finalScore: e.finalScore,
              })),
              epochStartUnix: epoch.startAtUnix,
              epochEndUnix: epoch.endAtUnix,
              influenceMultiplier,
            });

            await recordEngagementEvent({
              campaignId: campaign.id,
              epochId: epoch.id,
              walletPubkey: item.walletPubkey,
              registrationId: item.participant.registrationId,
              tweetId: item.tweet.id,
              tweetType: getTweetType(item.tweet),
              tweetText: item.tweet.text,
              tweetCreatedAtUnix: Math.floor(new Date(item.tweet.created_at).getTime() / 1000),
              referencedHandle: item.reference.matchedHandle,
              referencedHashtag: item.reference.matchedHashtag,
              referencedUrl: item.reference.matchedUrl,
              parentTweetId: item.tweet.referenced_tweets?.[0]?.id,
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
            campaignResult.errors.push(`Tweet ${item.tweet.id}: ${String(tweetError)}`);
          }
        }
      } catch (campaignError) {
        campaignResult.errors.push(String(campaignError));
      }

      results.push(campaignResult);
    }

    const totalEngagements = results.reduce((sum, r) => sum + r.engagementsRecorded, 0);
    const totalTweets = results.reduce((sum, r) => sum + r.tweetsFound, 0);

    // Get updated budget status for response
    const finalBudgetStatus = await getBudgetStatus();

    return NextResponse.json({
      success: true,
      campaignsProcessed: campaigns.length,
      totalTweetsFound: totalTweets,
      totalEngagementsRecorded: totalEngagements,
      apiCallsThisRun,
      budgetStatus: {
        postsUsed: finalBudgetStatus.posts.currentCount,
        postsRemaining: finalBudgetStatus.posts.remainingBudget,
        postsLimit: finalBudgetStatus.posts.monthlyLimit,
        percentUsed: finalBudgetStatus.posts.percentUsed.toFixed(1),
        warnings: finalBudgetStatus.warnings,
      },
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

async function hasAnyActiveParticipants(campaignId: string): Promise<boolean> {
  if (!hasDatabase()) return false;
  const pool = getPool();
  const res = await pool.query(
    `select 1
     from public.campaign_participants
     where campaign_id = $1 and status = 'active'
     limit 1`,
    [String(campaignId)]
  );
  return (res.rows ?? []).length > 0;
}

async function getActiveParticipantTwitterHandles(input: { campaignId: string; limit: number }): Promise<string[]> {
  if (!hasDatabase()) return [];
  const limit = Math.max(1, Math.min(50, Math.floor(Number(input.limit) || 0)));
  const pool = getPool();
  const res = await pool.query(
    `select hr.twitter_username
     from public.campaign_participants cp
     join public.holder_registrations hr
       on hr.wallet_pubkey = cp.wallet_pubkey
     where cp.campaign_id = $1
       and cp.status = 'active'
       and hr.status = 'active'
       and coalesce(hr.twitter_username, '') <> ''
     order by cp.opted_in_at_unix desc
     limit $2`,
    [String(input.campaignId), limit]
  );

  const out: string[] = [];
  for (const row of res.rows ?? []) {
    const raw = String(row.twitter_username ?? "").trim().replace(/^@+/, "");
    const sanitized = sanitizeHandle(raw);
    if (sanitized) out.push(sanitized);
  }
  return Array.from(new Set(out));
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

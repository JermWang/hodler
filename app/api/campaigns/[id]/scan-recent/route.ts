import { NextRequest } from "next/server";
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";

import { getPool, hasDatabase } from "@/app/lib/db";
import { getCampaignById, getHolderEngagementHistory, recordEngagementEvent } from "@/app/lib/campaignStore";
import { getConnection, getTokenBalanceForMint, getTokenSupplyForMint } from "@/app/lib/solana";
import { calculateEngagementScore } from "@/app/lib/engagementScoring";
import { getTweetType, tweetReferencesCampaign, type TwitterTweet } from "@/app/lib/twitter";
import { getInfluenceMultipliersForTwitterUserIds, getVerifiedStatusForTwitterUserIds } from "@/app/lib/twitterInfluenceStore";
import { checkRateLimit } from "@/app/lib/rateLimit";
import { canMakeApiCall, checkUserDailyLimit, incrementApiUsage } from "@/app/lib/twitterRateLimit";
import { withTraceJson } from "@/app/lib/trace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

function sanitizeHandle(raw: string): string | null {
  const v = String(raw ?? "").trim().replace(/^@+/, "");
  if (!v) return null;
  if (!/^[A-Za-z0-9_]{1,15}$/.test(v)) return null;
  return v;
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

function sanitizeUrlHost(raw: string): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  try {
    const url = new URL(s.includes("://") ? s : `https://${s}`);
    const host = url.hostname.replace(/^www\./i, "").toLowerCase();
    if (!host) return null;
    return host;
  } catch {
    return null;
  }
}

function expectedScanMessage(input: { campaignId: string; walletPubkey: string; timestampUnix: number }): string {
  return `AmpliFi\nScan Campaign Tweets\nCampaign: ${input.campaignId}\nWallet: ${input.walletPubkey}\nTimestamp: ${input.timestampUnix}`;
}

let ensuredScanCursorSchema: Promise<void> | null = null;
async function ensureScanCursorSchema(): Promise<void> {
  if (!hasDatabase()) return;
  if (ensuredScanCursorSchema) return ensuredScanCursorSchema;
  ensuredScanCursorSchema = (async () => {
    const pool = getPool();
    await pool.query(`
      create table if not exists public.campaign_twitter_search_cursors (
        campaign_id text not null,
        scope text not null,
        last_scanned_to_unix bigint not null,
        updated_at_unix bigint not null,
        primary key (campaign_id, scope)
      );
    `);
  })().catch((e) => {
    ensuredScanCursorSchema = null;
    throw e;
  });
  return ensuredScanCursorSchema;
}

async function getScanCursorUnix(input: { campaignId: string; scope: string }): Promise<number> {
  if (!hasDatabase()) return 0;
  await ensureScanCursorSchema();
  const pool = getPool();
  const res = await pool.query(
    `select last_scanned_to_unix
     from public.campaign_twitter_search_cursors
     where campaign_id=$1 and scope=$2
     limit 1`,
    [String(input.campaignId), String(input.scope)]
  );
  return Math.floor(Number(res.rows?.[0]?.last_scanned_to_unix ?? 0) || 0);
}

async function setScanCursorUnix(input: { campaignId: string; scope: string; lastScannedToUnix: number }): Promise<void> {
  if (!hasDatabase()) return;
  await ensureScanCursorSchema();
  const pool = getPool();
  const t = Math.floor(Number(input.lastScannedToUnix) || 0);
  await pool.query(
    `insert into public.campaign_twitter_search_cursors (campaign_id, scope, last_scanned_to_unix, updated_at_unix)
     values ($1, $2, $3, $4)
     on conflict (campaign_id, scope) do update set
       last_scanned_to_unix = excluded.last_scanned_to_unix,
       updated_at_unix = excluded.updated_at_unix`,
    [String(input.campaignId), String(input.scope), t, Math.floor(Date.now() / 1000)]
  );
}

async function searchTweetsWithBearerToken(input: {
  bearerToken: string;
  query: string;
  startTime?: string;
  endTime?: string;
  maxResults?: number;
  paginationToken?: string;
}): Promise<{ tweets: TwitterTweet[]; nextToken?: string }> {
  const params = new URLSearchParams({
    query: input.query,
    "tweet.fields": "created_at,public_metrics,referenced_tweets,entities,author_id",
    max_results: String(Math.max(10, Math.min(100, Number(input.maxResults ?? 100) || 100))),
  });

  if (input.startTime) params.set("start_time", input.startTime);
  if (input.endTime) params.set("end_time", input.endTime);
  if (input.paginationToken) params.set("pagination_token", input.paginationToken);

  const res = await fetch(`https://api.twitter.com/2/tweets/search/recent?${params.toString()}`, {
    headers: { Authorization: `Bearer ${input.bearerToken}` },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let parsed: any = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    const err: any = new Error(`Twitter search failed (${res.status}) ${text}`);
    err.status = res.status;
    err.twitter = parsed;
    if (err.twitter?.errors?.[0]?.message === "Usage cap exceeded") {
      err.status = 429;
    }
    throw err;
  }

  const data = (await res.json().catch(() => null)) as any;
  return {
    tweets: Array.isArray(data?.data) ? (data.data as TwitterTweet[]) : [],
    nextToken: typeof data?.meta?.next_token === "string" ? data.meta.next_token : undefined,
  };
}

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const json = (body: Record<string, unknown>, init?: ResponseInit) => withTraceJson(req, body, init);
  try {
    const rl = await checkRateLimit(req, { keyPrefix: "campaign:scan-recent", limit: 10, windowSeconds: 60 });
    if (!rl.allowed) {
      const res = json({ error: "Rate limit exceeded" }, { status: 429 });
      res.headers.set("retry-after", String(rl.retryAfterSeconds));
      return res;
    }

    if (!hasDatabase()) {
      return json({ error: "Database not available" }, { status: 503 });
    }

    const campaignId = String(ctx?.params?.id ?? "").trim();
    if (!campaignId) return json({ error: "Campaign id required" }, { status: 400 });

    const body = (await req.json().catch(() => null)) as any;
    const walletPubkey = typeof body?.walletPubkey === "string" ? body.walletPubkey.trim() : "";
    const signature = typeof body?.signature === "string" ? body.signature.trim() : "";
    const timestampUnix = Math.floor(Number(body?.timestampUnix ?? 0));
    const windowDaysRaw = Number(body?.windowDays ?? 7);
    const windowDays = Math.max(1, Math.min(7, Math.floor(Number.isFinite(windowDaysRaw) ? windowDaysRaw : 7)));
    const forceWindow = body?.forceWindow === true;

    if (!walletPubkey || !signature || !timestampUnix) {
      return json({ error: "walletPubkey, signature, and timestampUnix are required" }, { status: 400 });
    }

    const t = nowUnix();
    if (Math.abs(t - timestampUnix) > 300) {
      return json({ error: "Signature timestamp expired" }, { status: 400 });
    }

    let walletPk: PublicKey;
    try {
      walletPk = new PublicKey(walletPubkey);
    } catch {
      return json({ error: "Invalid walletPubkey" }, { status: 400 });
    }

    let sigBytes: Uint8Array;
    try {
      sigBytes = bs58.decode(signature);
    } catch {
      return json({ error: "Invalid signature encoding" }, { status: 400 });
    }

    const msg = expectedScanMessage({ campaignId, walletPubkey: walletPk.toBase58(), timestampUnix });
    const okSig = nacl.sign.detached.verify(new TextEncoder().encode(msg), sigBytes, walletPk.toBytes());
    if (!okSig) {
      return json({ error: "Invalid signature" }, { status: 401 });
    }

    const campaign = await getCampaignById(campaignId);
    if (!campaign) return json({ error: "Campaign not found" }, { status: 404 });

    if (campaign.status !== "active") {
      return json({ error: "Campaign is not active" }, { status: 400 });
    }

    if (t >= campaign.endAtUnix) {
      return json({ error: "Campaign has ended" }, { status: 400 });
    }

    const pool = getPool();

    // Must be a participant
    const participantRes = await pool.query(
      `select registration_id, token_balance_snapshot
       from public.campaign_participants
       where campaign_id=$1 and wallet_pubkey=$2 and status='active'
       limit 1`,
      [campaignId, walletPk.toBase58()]
    );
    const participantRow = participantRes.rows?.[0] ?? null;
    if (!participantRow) {
      return json({ error: "You must join the campaign before scanning" }, { status: 403 });
    }

    const scanMinIntervalSeconds = Math.max(10, Math.min(3600, Number(process.env.TWITTER_SCAN_MIN_INTERVAL_SECONDS ?? 60) || 60));
    const scanOverlapSeconds = Math.max(0, Math.min(900, Number(process.env.TWITTER_SCAN_OVERLAP_SECONDS ?? 30) || 30));
    const lastScannedToUnix = await getScanCursorUnix({ campaignId, scope: walletPk.toBase58() }).catch(() => 0);
    const secondsSinceLastScan = lastScannedToUnix > 0 ? t - lastScannedToUnix : 0;
    if (lastScannedToUnix > 0 && secondsSinceLastScan >= 0 && secondsSinceLastScan < scanMinIntervalSeconds) {
      const retryAfterSeconds = Math.max(1, scanMinIntervalSeconds - secondsSinceLastScan);
      const res = json({
        ok: true,
        windowDays,
        tweetsFound: 0,
        tweetsConsidered: 0,
        alreadyRecorded: 0,
        engagementsRecorded: 0,
        message: "Scan skipped. Please wait before scanning again.",
        retryAfterSeconds,
        usedCursor: !forceWindow && lastScannedToUnix > 0,
        lastScannedToUnix,
      });
      res.headers.set("retry-after", String(retryAfterSeconds));
      return res;
    }

    // Must have linked twitter
    const regRes = await pool.query(
      `select twitter_username, twitter_user_id
       from public.holder_registrations
       where wallet_pubkey=$1 and status='active'
       limit 1`,
      [walletPk.toBase58()]
    );
    const twitterUsernameRaw = String(regRes.rows?.[0]?.twitter_username ?? "").trim();
    const twitterUserId = String(regRes.rows?.[0]?.twitter_user_id ?? "").trim();

    if (!twitterUsernameRaw || !twitterUserId) {
      return json({ error: "Twitter account not verified. Please connect your Twitter first." }, { status: 400 });
    }

    // Holding requirement at scan time (prevents API abuse)
    const minRequired = campaign.minTokenBalance > 0n ? campaign.minTokenBalance : 1n;
    const mintPk = new PublicKey(String(campaign.tokenMint));
    const connection = getConnection();
    let currentBalance = 0n;
    let totalTokenSupply = 0n;
    try {
      const [bal, supply] = await Promise.all([
        getTokenBalanceForMint({ connection, owner: walletPk, mint: mintPk }),
        getTokenSupplyForMint({ connection, mint: mintPk }),
      ]);
      currentBalance = bal.amountRaw;
      totalTokenSupply = supply.amountRaw;
    } catch {
      return json({ error: "Failed to verify token balance or supply" }, { status: 503 });
    }
    if (totalTokenSupply <= 0n) {
      return json({ error: "Failed to verify token supply" }, { status: 503 });
    }
    if (currentBalance < minRequired) {
      return json(
        {
          error: "Must be holding the token to scan tweets",
          minRequired: minRequired.toString(),
          current: currentBalance.toString(),
        },
        { status: 403 }
      );
    }

    // Verified-only
    const bearerToken = String(process.env.TWITTER_BEARER_TOKEN ?? "").trim();
    if (!bearerToken) {
      return json({ error: "Twitter API not configured" }, { status: 503 });
    }

    // Prefer cache to avoid false negatives when budget is tight
    let isVerified = false;
    try {
      const cacheRes = await pool.query(
        `select verified
         from public.twitter_user_influence_cache
         where twitter_user_id=$1
         limit 1`,
        [twitterUserId]
      );
      const cachedVerified = cacheRes.rows?.[0]?.verified;
      if (cachedVerified === true) isVerified = true;
      if (cachedVerified === false) {
        return json({ error: "X account must be verified to scan" }, { status: 403 });
      }
    } catch {
    }

    if (!isVerified) {
      const verifiedMap = await getVerifiedStatusForTwitterUserIds({ twitterUserIds: [twitterUserId], bearerToken });
      isVerified = verifiedMap.get(twitterUserId) ?? false;
    }

    if (!isVerified) {
      return json({ error: "Unable to verify X account right now. Please try again soon." }, { status: 503 });
    }

    // Budget / abuse limits (we count per search call)
    const daily = await checkUserDailyLimit(walletPk.toBase58(), "tweets/search");
    if (!daily.allowed) {
      return json({ error: daily.reason, dailyLimit: daily.limit, currentCount: daily.currentCount }, { status: 429 });
    }

    const sanitizedFrom = sanitizeHandle(twitterUsernameRaw);
    if (!sanitizedFrom) {
      return json({ error: "Invalid twitter username" }, { status: 400 });
    }

    const sanitizedHandles = campaign.trackingHandles.map(sanitizeHandle).filter((v): v is string => Boolean(v)).slice(0, 10);
    const sanitizedTags = campaign.trackingHashtags
      .map(sanitizeTag)
      .filter((v): v is { kind: "hashtag" | "cashtag"; value: string } => Boolean(v))
      .slice(0, 10);
    const sanitizedUrlHosts = campaign.trackingUrls.map(sanitizeUrlHost).filter((v): v is string => Boolean(v)).slice(0, 10);

    const queryParts: string[] = [];
    for (const h of sanitizedHandles) queryParts.push(`"@${h}"`);
    for (const tag of sanitizedTags) queryParts.push(`"${tag.kind === "cashtag" ? "$" : "#"}${tag.value}"`);
    for (const host of sanitizedUrlHosts) queryParts.push(`url:"${host}"`);

    if (queryParts.length === 0) {
      return json({ error: "Campaign has no tracking handles or tags configured" }, { status: 400 });
    }

    const tags = sanitizedTags.map((tt) => `${tt.kind === "cashtag" ? "$" : "#"}${tt.value}`);

    const startUnixBase = Math.max(campaign.startAtUnix, t - windowDays * 86400);
    const usedCursor = !forceWindow && lastScannedToUnix > 0;
    const startUnix = usedCursor ? Math.max(startUnixBase, lastScannedToUnix - scanOverlapSeconds) : startUnixBase;
    const startTime = new Date(startUnix * 1000).toISOString();

    // Only consider epochs that are not settled. Backfilling into settled epochs cannot affect rewards.
    const epochsRes = await pool.query(
      `select id, start_at_unix, end_at_unix
       from public.epochs
       where campaign_id=$1
         and status = 'active'
         and end_at_unix > $2
         and start_at_unix <= $3
       order by start_at_unix asc`,
      [campaignId, startUnix, campaign.endAtUnix]
    );

    const epochs = (epochsRes.rows ?? []).map((r: any) => ({
      id: String(r.id),
      startAtUnix: Number(r.start_at_unix ?? 0),
      endAtUnix: Number(r.end_at_unix ?? 0),
    }));

    if (!epochs.length) {
      return json({
        ok: true,
        windowDays,
        scanned: 0,
        recorded: 0,
        message: "No open epochs available for scanning.",
        usedCursor,
        lastScannedToUnix,
        startTime,
      });
    }

    const tokenBalanceSnapshot = BigInt(String(participantRow.token_balance_snapshot ?? "0"));
    const registrationId = String(participantRow.registration_id ?? "");

    const query = `(${queryParts.join(" OR ")}) from:${sanitizedFrom}`;

    const maxResultsPerCall = Math.max(10, Math.min(100, Number(process.env.TWITTER_SCAN_MAX_RESULTS ?? 25) || 25));
    const maxPagesHard = Math.max(1, Math.min(5, Number(process.env.TWITTER_SCAN_MAX_PAGES ?? 2) || 2));
    const dailyRemaining = Math.max(0, daily.limit - daily.currentCount);
    const maxPagesByDaily = Math.max(0, Math.min(maxPagesHard, dailyRemaining));
    if (maxPagesByDaily === 0) {
      return json({ error: "Daily scan limit reached. Try again tomorrow." }, { status: 429 });
    }

    const budget = await canMakeApiCall("tweets/search", maxPagesByDaily);
    if (!budget.allowed) {
      return json({ error: budget.reason ?? "Twitter API budget exhausted" }, { status: 429 });
    }

    const maxPages = maxPagesByDaily;
    const tweets: TwitterTweet[] = [];
    let paginationToken: string | undefined;

    for (let page = 0; page < maxPages; page++) {
      const status = await canMakeApiCall("tweets/search", 1);
      if (!status.allowed) break;

      let r: Awaited<ReturnType<typeof searchTweetsWithBearerToken>>;
      try {
        r = await searchTweetsWithBearerToken({
          bearerToken,
          query,
          startTime,
          maxResults: maxResultsPerCall,
          paginationToken,
        });
      } catch (e: any) {
        const statusCode = Number(e?.status ?? 0) || 0;
        const tw = e?.twitter ?? null;
        const title = typeof tw?.title === "string" ? tw.title : "";
        const type = typeof tw?.type === "string" ? tw.type : "";
        const detail = typeof tw?.detail === "string" ? tw.detail : "";
        const monthlyCap = statusCode === 429 && (title === "UsageCapExceeded" || type.includes("usage-capped"));
        if (monthlyCap) {
          return json(
            {
              error: "X API monthly usage cap exceeded. Purchase a top-up or wait for the monthly reset.",
              detail: detail || null,
              twitter: tw,
            },
            { status: 429 }
          );
        }
        if (statusCode === 429) {
          return json({ error: "X API rate limit reached. Try again later.", twitter: tw }, { status: 429 });
        }
        throw e;
      }

      await incrementApiUsage("tweets/search", 1, walletPk.toBase58());

      tweets.push(...r.tweets);
      paginationToken = r.nextToken;
      if (!paginationToken) break;
    }

    const tweetByEpoch = new Map<
      string,
      Array<{ tweet: TwitterTweet; reference: ReturnType<typeof tweetReferencesCampaign> }>
    >();
    for (const tweet of tweets) {
      const createdAtUnix = Math.floor(new Date(tweet.created_at).getTime() / 1000);
      if (!Number.isFinite(createdAtUnix) || createdAtUnix < campaign.startAtUnix) continue;
      if (createdAtUnix >= campaign.endAtUnix) continue;

      const epoch = epochs.find((e) => createdAtUnix >= e.startAtUnix && createdAtUnix < e.endAtUnix);
      if (!epoch) continue;

      const reference = tweetReferencesCampaign(tweet, sanitizedHandles, tags, sanitizedUrlHosts);
      if (!reference.matches) continue;

      const list = tweetByEpoch.get(epoch.id) ?? [];
      list.push({ tweet, reference });
      tweetByEpoch.set(epoch.id, list);
    }

    const influenceByAuthor = await getInfluenceMultipliersForTwitterUserIds({ twitterUserIds: [twitterUserId], bearerToken }).catch(() => new Map());
    const influenceMultiplier = influenceByAuthor.get(twitterUserId) ?? 1;

    let recorded = 0;
    let considered = 0;
    let alreadyRecorded = 0;

    for (const [epochId, tweetsForEpoch] of tweetByEpoch.entries()) {
      const epoch = epochs.find((e) => e.id === epochId);
      if (!epoch) continue;

      const previous = await getHolderEngagementHistory(campaignId, walletPk.toBase58(), epochId);
      const existingTweetIds = new Set(previous.map((e) => e.tweetId));
      const rollingPrevious = previous.map((e) => ({
        tweetId: e.tweetId,
        tweetText: e.tweetText || "",
        tweetType: e.tweetType,
        createdAtUnix: e.tweetCreatedAtUnix,
        finalScore: e.finalScore,
      }));

      for (const item of tweetsForEpoch) {
        const tweet = item.tweet;
        considered += 1;

        if (existingTweetIds.has(tweet.id)) {
          alreadyRecorded += 1;
          continue;
        }

        const tweetCreatedAtUnix = Math.floor(new Date(tweet.created_at).getTime() / 1000);
        const scoringResult = calculateEngagementScore(tweet, {
          weights: {
            likeBps: campaign.weightLikeBps,
            retweetBps: campaign.weightRetweetBps,
            replyBps: campaign.weightReplyBps,
            quoteBps: campaign.weightQuoteBps,
          },
          holderTokenBalance: tokenBalanceSnapshot,
          totalTokenSupply,
          previousEngagements: rollingPrevious,
          epochStartUnix: epoch.startAtUnix,
          epochEndUnix: epoch.endAtUnix,
          influenceMultiplier,
        });

        // Note: recordEngagementEvent is idempotent via ON CONFLICT (campaign_id, tweet_id) DO NOTHING
        await recordEngagementEvent({
          campaignId,
          epochId,
          walletPubkey: walletPk.toBase58(),
          registrationId,
          tweetId: tweet.id,
          tweetType: getTweetType(tweet),
          tweetText: tweet.text,
          tweetCreatedAtUnix,
          referencedHandle: item.reference.matchedHandle,
          referencedHashtag: item.reference.matchedHashtag,
          referencedUrl: item.reference.matchedUrl,
          parentTweetId: tweet.referenced_tweets?.[0]?.id,
          basePoints: scoringResult.basePoints,
          balanceWeight: scoringResult.balanceWeight,
          timeConsistencyBonus: scoringResult.timeConsistencyBonus,
          antiSpamDampener: scoringResult.antiSpamDampener,
          finalScore: scoringResult.finalScore,
          isDuplicate: scoringResult.isDuplicate,
          isSpam: scoringResult.isSpam,
          spamReason: scoringResult.spamReason,
          createdAtUnix: tweetCreatedAtUnix,
        });

        existingTweetIds.add(tweet.id);
        rollingPrevious.push({
          tweetId: tweet.id,
          tweetText: tweet.text,
          tweetType: getTweetType(tweet),
          createdAtUnix: tweetCreatedAtUnix,
          finalScore: scoringResult.finalScore,
        });
        recorded += 1;
      }
    }

    const maxTweetCreatedAtUnix = tweets.reduce((max, tweet) => {
      const createdAtUnix = Math.floor(new Date(tweet.created_at).getTime() / 1000);
      if (!Number.isFinite(createdAtUnix)) return max;
      return createdAtUnix > max ? createdAtUnix : max;
    }, 0);
    const nextCursorUnix = maxTweetCreatedAtUnix > 0
      ? Math.max(lastScannedToUnix, maxTweetCreatedAtUnix)
      : Math.max(lastScannedToUnix, t - scanOverlapSeconds);

    await setScanCursorUnix({ campaignId, scope: walletPk.toBase58(), lastScannedToUnix: nextCursorUnix }).catch(() => {});

    return json({
      ok: true,
      windowDays,
      tweetsFound: tweets.length,
      tweetsConsidered: considered,
      alreadyRecorded,
      engagementsRecorded: recorded,
      usedCursor,
      lastScannedToUnix: nextCursorUnix,
      startTime,
      query,
    });
  } catch (e) {
    console.error("scan-recent error", e);
    return json({ error: "Failed to scan tweets" }, { status: 500 });
  }
}

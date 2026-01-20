/**
 * Twitter/X API Integration for AmpliFi
 * 
 * Handles OAuth 2.0 authentication and engagement tracking.
 * Requires Twitter API v2 access with OAuth 2.0 PKCE flow.
 * 
 * Environment variables required:
 * - TWITTER_CLIENT_ID: OAuth 2.0 Client ID
 * - TWITTER_CLIENT_SECRET: OAuth 2.0 Client Secret
 * - TWITTER_CALLBACK_URL: OAuth callback URL (e.g., https://amplifi.app/api/twitter/callback)
 */

import crypto from "crypto";

const TWITTER_API_BASE = "https://api.twitter.com/2";
const TWITTER_AUTH_URL = "https://twitter.com/i/oauth2/authorize";
const TWITTER_TOKEN_URL = "https://api.twitter.com/2/oauth2/token";

export interface TwitterUser {
  id: string;
  username: string;
  name: string;
  profile_image_url?: string;
  public_metrics?: {
    followers_count: number;
    following_count: number;
    tweet_count: number;
  };
}

export interface TwitterTweet {
  id: string;
  text: string;
  created_at: string;
  author_id: string;
  public_metrics?: {
    retweet_count: number;
    reply_count: number;
    like_count: number;
    quote_count: number;
  };
  referenced_tweets?: Array<{
    type: "retweeted" | "quoted" | "replied_to";
    id: string;
  }>;
  entities?: {
    mentions?: Array<{ username: string; id: string }>;
    hashtags?: Array<{ tag: string }>;
    urls?: Array<{ expanded_url: string; display_url: string }>;
  };
}

export interface TwitterTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  scope: string;
}

function getClientCredentials() {
  const clientId = process.env.TWITTER_CLIENT_ID;
  const clientSecret = process.env.TWITTER_CLIENT_SECRET;
  const callbackUrl = process.env.TWITTER_CALLBACK_URL;

  if (!clientId || !clientSecret || !callbackUrl) {
    throw new Error("Twitter API credentials not configured");
  }

  return { clientId, clientSecret, callbackUrl };
}

/**
 * Generate PKCE code verifier and challenge
 */
export function generatePKCE(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  
  return { codeVerifier, codeChallenge };
}

/**
 * Generate OAuth 2.0 authorization URL
 */
export function getAuthorizationUrl(state: string, codeChallenge: string): string {
  const { clientId, callbackUrl } = getClientCredentials();
  
  const scopes = [
    "tweet.read",
    "users.read",
    "offline.access",
  ].join(" ");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: callbackUrl,
    scope: scopes,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return `${TWITTER_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string
): Promise<TwitterTokens> {
  const { clientId, clientSecret, callbackUrl } = getClientCredentials();

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await fetch(TWITTER_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: callbackUrl,
      code_verifier: codeVerifier,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("Twitter token exchange failed:", error);
    throw new Error(`Twitter token exchange failed: ${response.status}`);
  }

  const data = await response.json();
  
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
    scope: data.scope,
  };
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(refreshToken: string): Promise<TwitterTokens> {
  const { clientId, clientSecret } = getClientCredentials();

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await fetch(TWITTER_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("Twitter token refresh failed:", error);
    throw new Error(`Twitter token refresh failed: ${response.status}`);
  }

  const data = await response.json();
  
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
    scope: data.scope,
  };
}

/**
 * Get authenticated user's profile
 */
export async function getAuthenticatedUser(accessToken: string): Promise<TwitterUser> {
  const response = await fetch(
    `${TWITTER_API_BASE}/users/me?user.fields=profile_image_url,public_metrics`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error("Twitter user fetch failed:", error);
    throw new Error(`Twitter user fetch failed: ${response.status}`);
  }

  const data = await response.json();
  return data.data;
}

/**
 * Search for tweets mentioning specific handles, hashtags, or URLs
 */
export async function searchTweets(
  accessToken: string,
  query: string,
  options: {
    startTime?: string;
    endTime?: string;
    maxResults?: number;
    paginationToken?: string;
  } = {}
): Promise<{ tweets: TwitterTweet[]; nextToken?: string }> {
  const params = new URLSearchParams({
    query,
    "tweet.fields": "created_at,public_metrics,referenced_tweets,entities,author_id",
    max_results: String(options.maxResults || 100),
  });

  if (options.startTime) params.set("start_time", options.startTime);
  if (options.endTime) params.set("end_time", options.endTime);
  if (options.paginationToken) params.set("pagination_token", options.paginationToken);

  const response = await fetch(
    `${TWITTER_API_BASE}/tweets/search/recent?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error("Twitter search failed:", error);
    throw new Error(`Twitter search failed: ${response.status}`);
  }

  const data = await response.json();
  
  return {
    tweets: data.data || [],
    nextToken: data.meta?.next_token,
  };
}

/**
 * Get tweets by a specific user
 */
export async function getUserTweets(
  accessToken: string,
  userId: string,
  options: {
    startTime?: string;
    endTime?: string;
    maxResults?: number;
    paginationToken?: string;
  } = {}
): Promise<{ tweets: TwitterTweet[]; nextToken?: string }> {
  const params = new URLSearchParams({
    "tweet.fields": "created_at,public_metrics,referenced_tweets,entities",
    max_results: String(options.maxResults || 100),
  });

  if (options.startTime) params.set("start_time", options.startTime);
  if (options.endTime) params.set("end_time", options.endTime);
  if (options.paginationToken) params.set("pagination_token", options.paginationToken);

  const response = await fetch(
    `${TWITTER_API_BASE}/users/${userId}/tweets?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error("Twitter user tweets fetch failed:", error);
    throw new Error(`Twitter user tweets fetch failed: ${response.status}`);
  }

  const data = await response.json();
  
  return {
    tweets: data.data || [],
    nextToken: data.meta?.next_token,
  };
}

/**
 * Determine tweet type from referenced_tweets
 */
export function getTweetType(tweet: TwitterTweet): "original" | "retweet" | "reply" | "quote" {
  if (!tweet.referenced_tweets || tweet.referenced_tweets.length === 0) {
    return "original";
  }

  const refTypes = tweet.referenced_tweets.map((r) => r.type);
  
  if (refTypes.includes("retweeted")) return "retweet";
  if (refTypes.includes("quoted")) return "quote";
  if (refTypes.includes("replied_to")) return "reply";
  
  return "original";
}

/**
 * Check if a tweet references a campaign (handle, hashtag, or URL)
 */
export function tweetReferencesCampaign(
  tweet: TwitterTweet,
  handles: string[],
  hashtags: string[],
  urls: string[]
): { matches: boolean; matchedHandle?: string; matchedHashtag?: string; matchedUrl?: string } {
  const normalizedHandles = handles.map((h) => h.toLowerCase().replace("@", ""));
  const parsedTags = hashtags
    .map((raw) => {
      const s = String(raw ?? "").trim();
      if (!s) return null;
      const kind = s.startsWith("$") ? "cashtag" : "hashtag";
      const value = s.replace(/^[#$]+/, "").toLowerCase();
      if (!value) return null;
      return { kind, value } as const;
    })
    .filter((v): v is { kind: "hashtag" | "cashtag"; value: string } => Boolean(v));
  const normalizedHashtags = parsedTags.filter((t) => t.kind === "hashtag").map((t) => t.value);
  const normalizedCashtags = parsedTags.filter((t) => t.kind === "cashtag").map((t) => t.value);
  const normalizedUrls = urls.map((u) => u.toLowerCase());

  // Check mentions
  if (tweet.entities?.mentions) {
    for (const mention of tweet.entities.mentions) {
      if (normalizedHandles.includes(mention.username.toLowerCase())) {
        return { matches: true, matchedHandle: mention.username };
      }
    }
  }

  // Check hashtags
  if (tweet.entities?.hashtags) {
    for (const hashtag of tweet.entities.hashtags) {
      if (normalizedHashtags.includes(hashtag.tag.toLowerCase())) {
        return { matches: true, matchedHashtag: hashtag.tag };
      }
    }
  }

  // Check cashtags (not always present in entities depending on API response)
  const cashtags = (tweet.entities as any)?.cashtags;
  if (Array.isArray(cashtags)) {
    for (const cashtag of cashtags) {
      const tag = String((cashtag as any)?.tag ?? "").toLowerCase();
      if (tag && normalizedCashtags.includes(tag)) {
        return { matches: true, matchedHashtag: tag };
      }
    }
  }

  // Check URLs
  if (tweet.entities?.urls) {
    for (const url of tweet.entities.urls) {
      const expandedLower = url.expanded_url.toLowerCase();
      for (const targetUrl of normalizedUrls) {
        if (expandedLower.includes(targetUrl)) {
          return { matches: true, matchedUrl: url.expanded_url };
        }
      }
    }
  }

  // Check tweet text as fallback
  const textLower = tweet.text.toLowerCase();
  
  for (const handle of normalizedHandles) {
    if (textLower.includes(`@${handle}`)) {
      return { matches: true, matchedHandle: handle };
    }
  }

  for (const hashtag of normalizedHashtags) {
    if (textLower.includes(`#${hashtag}`)) {
      return { matches: true, matchedHashtag: hashtag };
    }
  }

  for (const cashtag of normalizedCashtags) {
    if (textLower.includes(`$${cashtag}`)) {
      return { matches: true, matchedHashtag: cashtag };
    }
  }

  return { matches: false };
}

/**
 * Build search query for a campaign
 */
export function buildCampaignSearchQuery(
  handles: string[],
  hashtags: string[],
  urls: string[]
): string {
  const parts: string[] = [];

  for (const handle of handles) {
    const normalized = handle.replace("@", "");
    parts.push(`@${normalized}`);
  }

  for (const hashtag of hashtags) {
    const raw = String(hashtag ?? "").trim();
    if (!raw) continue;
    const isCashtag = raw.startsWith("$");
    const normalized = raw.replace(/^[#$]+/, "");
    if (!normalized) continue;
    parts.push(`${isCashtag ? "$" : "#"}${normalized}`);
  }

  for (const url of urls) {
    parts.push(`url:"${url}"`);
  }

  if (parts.length === 0) {
    throw new Error("Campaign must have at least one tracking handle, hashtag, or URL");
  }

  // Join with OR for any match
  return parts.join(" OR ");
}

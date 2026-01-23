import { canMakeApiCall, incrementApiUsage } from "./twitterRateLimit";
import { getPool, hasDatabase } from "./db";

function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

let ensuredSchema: Promise<void> | null = null;

async function ensureSchema(): Promise<void> {
  if (!hasDatabase()) return;
  if (ensuredSchema) return ensuredSchema;

  ensuredSchema = (async () => {
    const pool = getPool();
    await pool.query(`
      create table if not exists public.twitter_user_influence_cache (
        twitter_user_id text primary key,
        followers_count bigint null,
        following_count bigint null,
        tweet_count bigint null,
        created_at_unix bigint null,
        verified boolean null,
        has_profile_image boolean null,
        has_bio boolean null,
        trust_score double precision null,
        influence_multiplier double precision null,
        fetched_at_unix bigint not null,
        updated_at_unix bigint not null
      );
      create index if not exists twitter_user_influence_cache_fetched_idx on public.twitter_user_influence_cache(fetched_at_unix);
    `);
  })().catch((e) => {
    ensuredSchema = null;
    throw e;
  });

  return ensuredSchema;
}

type TwitterUserLookup = {
  id: string;
  created_at?: string;
  verified?: boolean;
  verified_type?: string;
  description?: string;
  profile_image_url?: string;
  public_metrics?: {
    followers_count: number;
    following_count: number;
    tweet_count: number;
  };
};

async function fetchUsersBatch(params: {
  bearerToken: string;
  twitterUserIds: string[];
}): Promise<TwitterUserLookup[]> {
  const ids = params.twitterUserIds.filter(Boolean);
  if (ids.length === 0) return [];

  const url = new URL("https://api.twitter.com/2/users");
  url.searchParams.set("ids", ids.join(","));
  url.searchParams.set("user.fields", "created_at,public_metrics,profile_image_url,verified,verified_type,description");

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${params.bearerToken}`,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Twitter users batch lookup failed: ${res.status} - ${text}`);
  }

  const json = await res.json();
  return (json.data ?? []) as TwitterUserLookup[];
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function computeTrustScore(input: {
  followers: number;
  following: number;
  tweetCount: number;
  createdAtUnix: number | null;
  verified: boolean | null;
  profileImageUrl: string | null;
  description: string | null;
}): number {
  let score = 1.0;

  const ageSeconds = input.createdAtUnix ? nowUnix() - input.createdAtUnix : null;
  const ageDays = ageSeconds != null ? ageSeconds / 86400 : null;

  if (ageDays != null) {
    if (ageDays < 30) score *= 0.35;
    else if (ageDays < 90) score *= 0.6;
    else if (ageDays < 180) score *= 0.8;
  }

  if (input.tweetCount < 25) score *= 0.55;
  else if (input.tweetCount < 100) score *= 0.75;

  const ratio = input.followers / (input.following + 1);
  if (ratio < 0.2) score *= 0.55;
  else if (ratio < 0.5) score *= 0.75;

  if (input.following > 5000 && input.followers < 1500) score *= 0.6;
  if (input.followers > 20000 && ratio < 1.2) score *= 0.75;

  const desc = String(input.description ?? "").trim();
  if (!desc) score *= 0.85;

  const img = String(input.profileImageUrl ?? "").trim();
  const hasProfileImage = Boolean(img) && !img.includes("default_profile_images");
  if (!hasProfileImage) score *= 0.85;

  if (input.verified) score = Math.max(score, 0.9);

  return clamp(score, 0.2, 1.0);
}

function computeInfluenceMultiplier(params: {
  followers: number;
  trustScore: number;
  maxMultiplier: number;
}): number {
  const followers = Math.max(0, Math.floor(params.followers));
  const log = Math.log10(followers + 1);
  const norm = clamp((log - 2) / 3, 0, 1);
  const raw = 1 + params.trustScore * norm * 2;
  return clamp(raw, 1, params.maxMultiplier);
}

async function getCachedRows(twitterUserIds: string[]): Promise<Map<string, { influence: number | null; fetchedAtUnix: number }>> {
  const out = new Map<string, { influence: number | null; fetchedAtUnix: number }>();
  if (!hasDatabase()) return out;
  await ensureSchema();

  const ids = twitterUserIds.filter(Boolean);
  if (ids.length === 0) return out;

  const pool = getPool();
  const res = await pool.query(
    `select twitter_user_id, influence_multiplier, fetched_at_unix
     from public.twitter_user_influence_cache
     where twitter_user_id = any($1::text[])`,
    [ids]
  );

  for (const row of res.rows ?? []) {
    const id = String(row.twitter_user_id);
    out.set(id, {
      influence: row.influence_multiplier == null ? null : Number(row.influence_multiplier),
      fetchedAtUnix: Number(row.fetched_at_unix ?? 0) || 0,
    });
  }

  return out;
}

async function upsertRows(rows: Array<{
  twitterUserId: string;
  followers: number;
  following: number;
  tweetCount: number;
  createdAtUnix: number | null;
  verified: boolean | null;
  hasProfileImage: boolean;
  hasBio: boolean;
  trustScore: number;
  influenceMultiplier: number;
}>): Promise<void> {
  if (!hasDatabase()) return;
  await ensureSchema();

  if (rows.length === 0) return;

  const pool = getPool();
  const ts = nowUnix();

  const values: any[] = [];
  const placeholders: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const base = i * 12;
    values.push(
      r.twitterUserId,
      r.followers,
      r.following,
      r.tweetCount,
      r.createdAtUnix,
      r.verified,
      r.hasProfileImage,
      r.hasBio,
      r.trustScore,
      r.influenceMultiplier,
      ts,
      ts
    );
    placeholders.push(
      `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12})`
    );
  }

  await pool.query(
    `insert into public.twitter_user_influence_cache (
      twitter_user_id, followers_count, following_count, tweet_count, created_at_unix,
      verified, has_profile_image, has_bio, trust_score, influence_multiplier,
      fetched_at_unix, updated_at_unix
    ) values ${placeholders.join(",")}
    on conflict (twitter_user_id) do update set
      followers_count = excluded.followers_count,
      following_count = excluded.following_count,
      tweet_count = excluded.tweet_count,
      created_at_unix = excluded.created_at_unix,
      verified = excluded.verified,
      has_profile_image = excluded.has_profile_image,
      has_bio = excluded.has_bio,
      trust_score = excluded.trust_score,
      influence_multiplier = excluded.influence_multiplier,
      fetched_at_unix = excluded.fetched_at_unix,
      updated_at_unix = excluded.updated_at_unix`,
    values
  );
}

/**
 * Check if Twitter users are verified (Twitter Blue/Premium)
 * Returns a map of twitter_user_id -> verified status
 */
export async function getVerifiedStatusForTwitterUserIds(input: {
  twitterUserIds: string[];
  bearerToken: string;
  forceRefresh?: boolean;
}): Promise<Map<string, boolean>> {
  const ttlSeconds = Math.max(3600, Number(process.env.TWITTER_INFLUENCE_CACHE_TTL_SECONDS ?? 7 * 86400) || 7 * 86400);

  const ids0 = input.twitterUserIds.map((v) => String(v ?? "").trim()).filter(Boolean);
  const ids = Array.from(new Set(ids0));

  const result = new Map<string, boolean>();
  if (ids.length === 0) return result;

  // Check cache first
  if (hasDatabase()) {
    await ensureSchema();
    const pool = getPool();
    const cached = await pool.query(
      `select twitter_user_id, verified, fetched_at_unix
       from public.twitter_user_influence_cache
       where twitter_user_id = any($1::text[])`,
      [ids]
    );

    const staleIds: string[] = [];
    const cachedById = new Map<string, { verified: boolean | null; fetchedAtUnix: number }>();
    
    for (const row of cached.rows ?? []) {
      cachedById.set(String(row.twitter_user_id), {
        verified: row.verified,
        fetchedAtUnix: Number(row.fetched_at_unix ?? 0),
      });
    }

    const forceRefresh = Boolean(input.forceRefresh);

    for (const id of ids) {
      const c = cachedById.get(id);
      const fresh = c && c.fetchedAtUnix > nowUnix() - ttlSeconds;
      if (!forceRefresh && fresh && c?.verified != null) {
        result.set(id, Boolean(c.verified));
      } else {
        staleIds.push(id);
      }
    }

    // If all cached and fresh, return early
    if (staleIds.length === 0) return result;

    // Fetch stale users - this will also update the cache via getInfluenceMultipliersForTwitterUserIds
    await getInfluenceMultipliersForTwitterUserIds({
      twitterUserIds: staleIds,
      bearerToken: input.bearerToken,
      skipBudgetCheck: Boolean(input.forceRefresh),
    });

    // Re-query cache for updated values
    const updated = await pool.query(
      `select twitter_user_id, verified
       from public.twitter_user_influence_cache
       where twitter_user_id = any($1::text[])`,
      [staleIds]
    );

    for (const row of updated.rows ?? []) {
      result.set(String(row.twitter_user_id), Boolean(row.verified));
    }
  }

  // Default unverified for any missing
  for (const id of ids) {
    if (!result.has(id)) result.set(id, false);
  }

  return result;
}

export async function getInfluenceMultipliersForTwitterUserIds(input: {
  twitterUserIds: string[];
  bearerToken: string;
  skipBudgetCheck?: boolean;
}): Promise<Map<string, number>> {
  const ttlSeconds = Math.max(3600, Number(process.env.TWITTER_INFLUENCE_CACHE_TTL_SECONDS ?? 7 * 86400) || 7 * 86400);
  const maxMultiplier = clamp(Number(process.env.TWITTER_INFLUENCE_MAX_MULTIPLIER ?? 3) || 3, 1, 3);

  const ids0 = input.twitterUserIds.map((v) => String(v ?? "").trim()).filter(Boolean);
  const ids = Array.from(new Set(ids0));

  const result = new Map<string, number>();
  if (ids.length === 0) return result;

  const cached = await getCachedRows(ids);
  const staleIds: string[] = [];

  for (const id of ids) {
    const c = cached.get(id);
    const fresh = c && c.fetchedAtUnix > nowUnix() - ttlSeconds;
    if (fresh && c?.influence != null && Number.isFinite(c.influence)) {
      result.set(id, clamp(Number(c.influence), 1, maxMultiplier));
    } else {
      staleIds.push(id);
    }
  }

  if (staleIds.length === 0) return result;

  const batchSize = 100;
  const batchesNeeded = Math.ceil(staleIds.length / batchSize);

  if (!input.skipBudgetCheck) {
    const budgetCheck = await canMakeApiCall("users/lookup", batchesNeeded);
    if (!budgetCheck.allowed) {
      for (const id of staleIds) result.set(id, 1);
      return result;
    }
  }

  const upserts: Array<{
    twitterUserId: string;
    followers: number;
    following: number;
    tweetCount: number;
    createdAtUnix: number | null;
    verified: boolean | null;
    hasProfileImage: boolean;
    hasBio: boolean;
    trustScore: number;
    influenceMultiplier: number;
  }> = [];

  for (let i = 0; i < staleIds.length; i += batchSize) {
    const batch = staleIds.slice(i, i + batchSize);
    let users: TwitterUserLookup[] = [];
    try {
      users = await fetchUsersBatch({ bearerToken: input.bearerToken, twitterUserIds: batch });
      await incrementApiUsage("users/lookup", 1);
    } catch {
      for (const id of batch) result.set(id, 1);
      continue;
    }

    const byId = new Map(users.map((u) => [String(u.id), u]));

    for (const id of batch) {
      const u = byId.get(id);
      if (!u) {
        result.set(id, 1);
        continue;
      }

      const followers = Number(u.public_metrics?.followers_count ?? 0) || 0;
      const following = Number(u.public_metrics?.following_count ?? 0) || 0;
      const tweetCount = Number(u.public_metrics?.tweet_count ?? 0) || 0;

      const createdAtUnix = u.created_at ? Math.floor(new Date(u.created_at).getTime() / 1000) : null;
      const verifiedTypeRaw = (u as any)?.verified_type;
      const verifiedType = typeof verifiedTypeRaw === "string" ? verifiedTypeRaw.trim() : "";
      const verified = u.verified === true || Boolean(verifiedType) ? true : u.verified == null ? null : Boolean(u.verified);
      const profileImageUrl = u.profile_image_url == null ? null : String(u.profile_image_url);
      const description = u.description == null ? null : String(u.description);

      const trustScore = computeTrustScore({
        followers,
        following,
        tweetCount,
        createdAtUnix,
        verified,
        profileImageUrl,
        description,
      });

      const influenceMultiplier = computeInfluenceMultiplier({
        followers,
        trustScore,
        maxMultiplier,
      });

      const hasBio = Boolean(String(description ?? "").trim());
      const hasProfileImage = Boolean(String(profileImageUrl ?? "").trim()) && !String(profileImageUrl ?? "").includes("default_profile_images");

      result.set(id, influenceMultiplier);
      upserts.push({
        twitterUserId: id,
        followers,
        following,
        tweetCount,
        createdAtUnix,
        verified,
        hasProfileImage,
        hasBio,
        trustScore,
        influenceMultiplier,
      });
    }
  }

  await upsertRows(upserts).catch(() => undefined);

  for (const id of ids) {
    if (!result.has(id)) result.set(id, 1);
  }

  return result;
}

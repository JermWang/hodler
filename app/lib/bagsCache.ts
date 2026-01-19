import { hasDatabase, getPool } from "./db";
import {
  searchDexScreenerPairs,
  filterByDex,
  sortByMarketCap,
  deduplicateByBaseToken,
  DexScreenerPair,
  fetchDexScreenerPairsByTokenMints,
} from "./dexScreener";

const BAGS_API_KEY = process.env.BAGS_API_KEY ?? "";
const BAGS_API_BASE = "https://public-api-v2.bags.fm/api/v1";

// Bags program signer - tokens launched via Bags have this as a signer
const BAGS_PROGRAM_SIGNER = "BAGSB9TpGrZxQbEsrEznv5jXXdwyP6AXerN8aVRiAmcv";

async function fetchBagsTokenMints(): Promise<string[]> {
  // Try to get recent Bags launches from their API
  // The claimable-positions endpoint returns tokens, but we need a wallet
  // For now, we'll use DexScreener search as fallback
  
  if (!BAGS_API_KEY) {
    console.log("[bagsCache] No BAGS_API_KEY, using DexScreener search only");
    return [];
  }

  try {
    // Try the token-launch endpoint to get recent launches
    // This is a guess based on the API structure - may need adjustment
    const res = await fetch(`${BAGS_API_BASE}/token-launch/recent`, {
      method: "GET",
      headers: { "x-api-key": BAGS_API_KEY },
    });

    if (res.ok) {
      const json = await res.json();
      const tokens = json?.response ?? json ?? [];
      if (Array.isArray(tokens)) {
        const mints = tokens
          .map((t: any) => t?.tokenMint ?? t?.baseMint ?? t?.mint)
          .filter((m: any) => typeof m === "string" && m.length > 0);
        console.log(`[bagsCache] Got ${mints.length} token mints from Bags API`);
        return mints;
      }
    }
  } catch (e) {
    console.error("[bagsCache] Failed to fetch from Bags API:", e);
  }

  return [];
}

export type CachedBagsToken = {
  mint: string;
  name: string;
  symbol: string;
  priceUsd: string | null;
  marketCap: number | null;
  fdv: number | null;
  volume24h: number | null;
  liquidity: number | null;
  priceChange24h: number | null;
  pairAddress: string | null;
  dexScreenerUrl: string | null;
  imageUrl: string | null;
  createdAt: string | null;
};

let memoryCache: CachedBagsToken[] = [];
let memoryCacheTimestamp = 0;
const MEMORY_CACHE_TTL_MS = 60_000; // 1 minute for in-memory cache

async function ensureCacheTable(): Promise<void> {
  if (!hasDatabase()) return;

  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bags_token_cache (
      mint TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      symbol TEXT NOT NULL,
      price_usd TEXT,
      market_cap DOUBLE PRECISION,
      fdv DOUBLE PRECISION,
      volume_24h DOUBLE PRECISION,
      liquidity DOUBLE PRECISION,
      price_change_24h DOUBLE PRECISION,
      pair_address TEXT,
      dex_screener_url TEXT,
      image_url TEXT,
      created_at TEXT,
      cached_at_unix BIGINT NOT NULL
    )
  `);
}

export async function getCachedBagsTokens(): Promise<CachedBagsToken[]> {
  const now = Date.now();
  
  // Return from memory cache if fresh
  if (memoryCache.length > 0 && now - memoryCacheTimestamp < MEMORY_CACHE_TTL_MS) {
    return memoryCache;
  }

  // Try to load from DB cache
  if (hasDatabase()) {
    try {
      await ensureCacheTable();
      const pool = getPool();
      const res = await pool.query(`
        SELECT mint, name, symbol, price_usd, market_cap, fdv, volume_24h, 
               liquidity, price_change_24h, pair_address, dex_screener_url, 
               image_url, created_at
        FROM bags_token_cache
        ORDER BY market_cap DESC NULLS LAST
      `);

      if (res.rows.length > 0) {
        const tokens: CachedBagsToken[] = res.rows.map((row: any) => ({
          mint: String(row.mint),
          name: String(row.name ?? ""),
          symbol: String(row.symbol ?? ""),
          priceUsd: row.price_usd ? String(row.price_usd) : null,
          marketCap: row.market_cap != null ? Number(row.market_cap) : null,
          fdv: row.fdv != null ? Number(row.fdv) : null,
          volume24h: row.volume_24h != null ? Number(row.volume_24h) : null,
          liquidity: row.liquidity != null ? Number(row.liquidity) : null,
          priceChange24h: row.price_change_24h != null ? Number(row.price_change_24h) : null,
          pairAddress: row.pair_address ? String(row.pair_address) : null,
          dexScreenerUrl: row.dex_screener_url ? String(row.dex_screener_url) : null,
          imageUrl: row.image_url ? String(row.image_url) : null,
          createdAt: row.created_at ? String(row.created_at) : null,
        }));

        memoryCache = tokens;
        memoryCacheTimestamp = now;
        return tokens;
      }
    } catch (e) {
      console.error("[bagsCache] Failed to read DB cache:", e);
    }
  }

  // Cache is empty - fetch fresh data
  if (memoryCache.length === 0) {
    console.log("[bagsCache] Cache empty, fetching fresh data...");
    await refreshBagsCache();
  }

  return memoryCache;
}

export async function refreshBagsCache(): Promise<{ count: number; error?: string }> {
  const allPairs: DexScreenerPair[] = [];

  // Strategy 1: Try to get token mints from Bags API first
  const bagsTokenMints = await fetchBagsTokenMints();
  
  if (bagsTokenMints.length > 0) {
    console.log(`[bagsCache] Fetching market data for ${bagsTokenMints.length} Bags tokens...`);
    
    // Batch fetch from DexScreener (max 30 per request)
    for (let i = 0; i < bagsTokenMints.length; i += 30) {
      const batch = bagsTokenMints.slice(i, i + 30);
      try {
        const { pairs } = await fetchDexScreenerPairsByTokenMints({
          tokenMints: batch,
          timeoutMs: 10000,
        });
        allPairs.push(...pairs);
        console.log(`[bagsCache] Batch ${Math.floor(i / 30) + 1}: got ${pairs.length} pairs`);
      } catch (e) {
        console.error(`[bagsCache] Batch fetch failed:`, e);
      }
    }
  }

  // Strategy 2: Also search DexScreener for Meteora tokens (fallback/supplement)
  const searches = [
    "meteora",
    "meteora solana",
    "BAGS",
    "BAGS solana",
  ];

  for (const query of searches) {
    try {
      const { pairs } = await searchDexScreenerPairs({ query, timeoutMs: 8000 });
      allPairs.push(...pairs);
      console.log(`[bagsCache] Search "${query}" returned ${pairs.length} pairs`);
    } catch (e) {
      console.error(`[bagsCache] Search failed for "${query}":`, e);
    }
  }

  console.log(`[bagsCache] Total pairs before filtering: ${allPairs.length}`);

  // Filter to Meteora DEX pairs only (Bags.fm uses Meteora)
  let filtered = filterByDex(allPairs, "meteora");
  console.log(`[bagsCache] After meteora filter: ${filtered.length}`);
  
  filtered = deduplicateByBaseToken(filtered);
  filtered = sortByMarketCap(filtered, true);
  console.log(`[bagsCache] Final unique tokens: ${filtered.length}`);

  const tokens: CachedBagsToken[] = filtered.map((p) => ({
    mint: p.baseToken?.address ?? "",
    name: p.baseToken?.name ?? "",
    symbol: p.baseToken?.symbol ?? "",
    priceUsd: p.priceUsd ?? null,
    marketCap: p.marketCap ?? null,
    fdv: p.fdv ?? null,
    volume24h: p.volume?.h24 ?? null,
    liquidity: p.liquidity?.usd ?? null,
    priceChange24h: p.priceChange?.h24 ?? null,
    pairAddress: p.pairAddress ?? null,
    dexScreenerUrl: p.url ?? null,
    imageUrl: p.info?.imageUrl ?? null,
    createdAt: p.pairCreatedAt ? new Date(p.pairCreatedAt).toISOString() : null,
  }));

  memoryCache = tokens;
  memoryCacheTimestamp = Date.now();

  if (!hasDatabase()) {
    return { count: tokens.length };
  }

  try {
    await ensureCacheTable();
    const pool = getPool();
    const nowUnix = Math.floor(Date.now() / 1000);

    await pool.query("DELETE FROM bags_token_cache");

    for (const token of tokens) {
      await pool.query(
        `INSERT INTO bags_token_cache 
         (mint, name, symbol, price_usd, market_cap, fdv, volume_24h, liquidity, 
          price_change_24h, pair_address, dex_screener_url, image_url, created_at, cached_at_unix)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         ON CONFLICT (mint) DO UPDATE SET
           name = EXCLUDED.name,
           symbol = EXCLUDED.symbol,
           price_usd = EXCLUDED.price_usd,
           market_cap = EXCLUDED.market_cap,
           fdv = EXCLUDED.fdv,
           volume_24h = EXCLUDED.volume_24h,
           liquidity = EXCLUDED.liquidity,
           price_change_24h = EXCLUDED.price_change_24h,
           pair_address = EXCLUDED.pair_address,
           dex_screener_url = EXCLUDED.dex_screener_url,
           image_url = EXCLUDED.image_url,
           created_at = EXCLUDED.created_at,
           cached_at_unix = EXCLUDED.cached_at_unix`,
        [
          token.mint,
          token.name,
          token.symbol,
          token.priceUsd,
          token.marketCap,
          token.fdv,
          token.volume24h,
          token.liquidity,
          token.priceChange24h,
          token.pairAddress,
          token.dexScreenerUrl,
          token.imageUrl,
          token.createdAt,
          nowUnix,
        ]
      );
    }

    return { count: tokens.length };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[bagsCache] Failed to write cache:", e);
    return { count: tokens.length, error: msg };
  }
}

export function filterByMinMarketCap(tokens: CachedBagsToken[], minMarketCap: number): CachedBagsToken[] {
  const min = Number(minMarketCap) || 0;
  if (min <= 0) return tokens;
  return tokens.filter((t) => {
    const mc = Number(t.marketCap ?? 0);
    return Number.isFinite(mc) && mc >= min;
  });
}

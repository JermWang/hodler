import { hasDatabase, getPool } from "./db";
import {
  searchDexScreenerPairs,
  filterByDex,
  sortByMarketCap,
  deduplicateByBaseToken,
  DexScreenerPair,
  fetchDexScreenerPairsByTokenMints,
} from "./dexScreener";
import { getRpcUrls } from "./rpc";

const BAGS_API_KEY = process.env.BAGS_API_KEY ?? "";
const BAGS_API_BASE = "https://public-api-v2.bags.fm/api/v1";

// Bags program signer - tokens launched via Bags have this as a signer
const BAGS_PROGRAM_SIGNER = "BAGSB9TpGrZxQbEsrEznv5jXXdwyP6AXerN8aVRiAmcv";

const BAGS_TOKEN_VERIFY_TTL_MS = 10 * 60_000;
const verifiedMintCache = new Map<string, { ok: boolean; ts: number }>();

async function verifyBagsTokenMintViaApi(tokenMint: string): Promise<boolean> {
  const mint = String(tokenMint ?? "").trim();
  if (!mint) return false;
  if (!BAGS_API_KEY) return false;

  const now = Date.now();
  const cached = verifiedMintCache.get(mint);
  if (cached && now - cached.ts < BAGS_TOKEN_VERIFY_TTL_MS) return cached.ok;

  const paramNames = ["tokenMint", "mint", "baseMint"] as const;
  for (const paramName of paramNames) {
    try {
      const url = `${BAGS_API_BASE}/token-launch/creator/v3?${paramName}=${encodeURIComponent(mint)}`;
      const res = await fetch(url, {
        method: "GET",
        headers: { "x-api-key": BAGS_API_KEY },
        cache: "no-store",
      });

      const json = await res.json().catch(() => null);
      if (res.ok && json?.success !== false) {
        const ok = Array.isArray(json?.response) && json.response.length > 0;
        verifiedMintCache.set(mint, { ok, ts: now });
        return ok;
      }
    } catch {
    }
  }

  verifiedMintCache.set(mint, { ok: false, ts: now });
  return false;
}

async function discoverBagsTokenMintsFromDexScreener(): Promise<string[]> {
  if (!BAGS_API_KEY) return [];

  const queries = ["bags.fm", "bags", "BAGS solana", "bags launch", "bags bonding curve"];
  const candidateMints: string[] = [];

  for (const query of queries) {
    try {
      const { pairs } = await searchDexScreenerPairs({ query, timeoutMs: 8000 });
      for (const p of pairs) {
        const mint = String(p?.baseToken?.address ?? "").trim();
        if (mint) candidateMints.push(mint);
      }
    } catch {
    }
  }

  const unique = Array.from(new Set(candidateMints)).slice(0, 200);
  const verified: string[] = [];
  for (const mint of unique) {
    // sequential verification to avoid slamming Bags API
    if (await verifyBagsTokenMintViaApi(mint)) {
      verified.push(mint);
      if (verified.length >= 120) break;
    }
  }

  if (verified.length > 0) {
    console.log(`[bagsCache] Got ${verified.length} verified token mints from DexScreener search`);
  }
  return verified;
}

async function fetchBagsTokenMintsFromHelius(): Promise<string[]> {
  // Use Helius DAS API to find tokens created by Bags program signer
  const rpcUrl = getRpcUrls().find((u) => u.toLowerCase().includes("helius"));
  if (!rpcUrl) {
    console.log("[bagsCache] No Helius RPC URL, skipping DAS query");
    return [];
  }

  try {
    const limit = 100;
    const maxPages = 10;
    const out: string[] = [];

    for (let page = 1; page <= maxPages; page++) {
      // Query for token mints where the Bags signer was involved
      // Using getAssetsByCreator to find tokens created by Bags
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: `bags-tokens:${page}`,
          method: "getAssetsByCreator",
          params: {
            creatorAddress: BAGS_PROGRAM_SIGNER,
            onlyVerified: false,
            page,
            limit,
          },
        }),
      });

      if (!res.ok) break;
      const json = await res.json().catch(() => null);
      const items = json?.result?.items ?? [];
      const mints = items
        .filter((item: any) => item?.interface === "FungibleToken" || item?.interface === "FungibleAsset")
        .map((item: any) => item?.id)
        .filter((m: any) => typeof m === "string" && m.length > 0);

      out.push(...mints);

      if (!Array.isArray(items) || items.length < limit) {
        break;
      }
    }

    const unique = Array.from(new Set(out));
    console.log(`[bagsCache] Got ${unique.length} token mints from Helius DAS`);
    return unique;
  } catch (e) {
    console.error("[bagsCache] Helius DAS query failed:", e);
  }

  return [];
}

async function fetchBagsTokenMints(input?: { limit?: number }): Promise<string[]> {
  const limit = Math.max(1, Math.min(1000, Math.floor(Number(input?.limit ?? 450) || 450)));

  // Strategy 1: Try Helius DAS API
  const heliusMints = await fetchBagsTokenMintsFromHelius();
  if (heliusMints.length > 0) {
    return heliusMints.slice(0, limit);
  }

  // Strategy 2: Try Bags API (if they have a token list endpoint)
  if (BAGS_API_KEY) {
    try {
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
          if (mints.length > 0) {
            console.log(`[bagsCache] Got ${mints.length} token mints from Bags API`);
            return mints.slice(0, limit);
          }
        }
      }
    } catch (e) {
      console.error("[bagsCache] Bags API query failed:", e);
    }
  }

  // Strategy 3: DexScreener candidates + verify each mint via Bags API
  if (BAGS_API_KEY) {
    const verified = await discoverBagsTokenMintsFromDexScreener();
    if (verified.length > 0) return verified.slice(0, limit);
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

        if (BAGS_API_KEY) {
          try {
            const bagsMints = await fetchBagsTokenMints();
            const bagsMintSet = new Set(
              bagsMints
                .map((m) => String(m ?? "").trim())
                .filter((m) => m.length > 0)
            );

            if (bagsMintSet.size >= 25) {
              const filtered = tokens.filter((t) => bagsMintSet.has(String(t.mint ?? "").trim()));
              memoryCache = filtered;
              memoryCacheTimestamp = now;
              return filtered;
            }

            const verified: CachedBagsToken[] = [];
            for (const t of tokens.slice(0, 200)) {
              const mint = String(t.mint ?? "").trim();
              if (!mint) continue;
              if (await verifyBagsTokenMintViaApi(mint)) {
                verified.push(t);
                if (verified.length >= 120) break;
              }
            }

            if (verified.length > 0) {
              memoryCache = verified;
              memoryCacheTimestamp = now;
              return verified;
            }
          } catch (e) {
            console.error("[bagsCache] Failed to verify DB cache against Bags token list:", e);
          }

          memoryCache = [];
          memoryCacheTimestamp = now;
          return [];
        }

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
  const bagsMintSet = new Set(
    bagsTokenMints
      .map((m) => String(m ?? "").trim())
      .filter((m) => m.length > 0)
  );
  
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
      const scopedPairs = bagsMintSet.size
        ? pairs.filter((p) => bagsMintSet.has(String(p?.baseToken?.address ?? "").trim()))
        : [];
      allPairs.push(...scopedPairs);
      console.log(`[bagsCache] Search "${query}" returned ${scopedPairs.length} pairs`);
    } catch (e) {
      console.error(`[bagsCache] Search failed for "${query}":`, e);
    }
  }

  console.log(`[bagsCache] Total pairs before filtering: ${allPairs.length}`);

  const scopedPairs = bagsMintSet.size
    ? allPairs.filter((p) => bagsMintSet.has(String(p?.baseToken?.address ?? "").trim()))
    : [];

  // Filter to Meteora DEX pairs only (Bags.fm uses Meteora)
  let filtered = filterByDex(scopedPairs, "meteora");
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

  if (tokens.length === 0) {
    const msg = "No tokens resolved; cache not updated";
    console.error(`[bagsCache] ${msg}`);
    return { count: 0, error: msg };
  }

  memoryCache = tokens;
  memoryCacheTimestamp = Date.now();

  if (!hasDatabase()) {
    return { count: tokens.length };
  }

  try {
    await ensureCacheTable();
    const pool = getPool();
    const nowUnix = Math.floor(Date.now() / 1000);

    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("DELETE FROM bags_token_cache");

      for (const token of tokens) {
        if (!token.mint) continue;
        await client.query(
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

      await client.query("commit");
    } catch (e) {
      try {
        await client.query("rollback");
      } catch {
      }
      throw e;
    } finally {
      client.release();
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

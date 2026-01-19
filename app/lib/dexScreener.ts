const DEXSCREENER_BASE_URL = "https://api.dexscreener.com";
const BAGS_VANITY_SUFFIX = "BAGS";

type DexScreenerTokenResponse = {
  pairs?: DexScreenerPair[];
};

type DexScreenerSearchResponse = {
  pairs?: DexScreenerPair[];
};

export type DexScreenerPair = {
  chainId?: string;
  dexId?: string;
  url?: string;
  pairAddress?: string;
  baseToken?: {
    address?: string;
    name?: string;
    symbol?: string;
  };
  quoteToken?: {
    address?: string;
    name?: string;
    symbol?: string;
  };
  priceNative?: string;
  priceUsd?: string;
  txns?: {
    m5?: { buys?: number; sells?: number };
    h1?: { buys?: number; sells?: number };
    h6?: { buys?: number; sells?: number };
    h24?: { buys?: number; sells?: number };
  };
  liquidity?: { usd?: number; base?: number; quote?: number };
  volume?: { h1?: number; h6?: number; h24?: number; m5?: number };
  priceChange?: { m5?: number; h1?: number; h6?: number; h24?: number };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
  info?: {
    imageUrl?: string;
    header?: string;
    websites?: { url?: string; label?: string }[];
    socials?: { url?: string; type?: string }[];
  };
};

export async function fetchDexScreenerPairsByTokenMint(input: {
  tokenMint: string;
  timeoutMs?: number;
}): Promise<{ pairs: DexScreenerPair[] }> {
  const tokenMint = String(input.tokenMint ?? "").trim();
  if (!tokenMint) throw new Error("tokenMint is required");

  const timeoutMs = Math.max(500, Math.min(10_000, Number(input.timeoutMs ?? 2500) || 2500));

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = `https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(tokenMint)}`;
    const res = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!res.ok) {
      throw new Error(`DexScreener request failed (${res.status})`);
    }

    const json = (await res.json().catch(() => null)) as DexScreenerTokenResponse | null;
    const pairs = Array.isArray(json?.pairs) ? (json?.pairs ?? []) : [];
    return { pairs };
  } finally {
    clearTimeout(t);
  }
}

export function pickBestDexScreenerPair(input: {
  pairs: DexScreenerPair[];
  chainId: string;
  minLiquidityUsd?: number;
}): DexScreenerPair | null {
  const chainId = String(input.chainId ?? "").trim().toLowerCase();
  const minLiquidityUsd = Number(input.minLiquidityUsd ?? 0) || 0;

  const pairs = (Array.isArray(input.pairs) ? input.pairs : []).filter((p) => {
    const c = String(p?.chainId ?? "").trim().toLowerCase();
    if (!c || c !== chainId) return false;
    const liq = Number(p?.liquidity?.usd ?? 0);
    if (!Number.isFinite(liq) || liq <= 0) return false;
    if (liq < minLiquidityUsd) return false;
    return true;
  });

  if (!pairs.length) return null;

  let best: DexScreenerPair | null = null;
  let bestScore = -1;

  for (const p of pairs) {
    const liq = Number(p?.liquidity?.usd ?? 0);
    const vol24 = Number(p?.volume?.h24 ?? 0);
    const score = liq * 0.7 + vol24 * 0.3;
    if (!Number.isFinite(score)) continue;

    if (score > bestScore) {
      bestScore = score;
      best = p;
      continue;
    }

    if (score === bestScore) {
      const bestAddr = String(best?.pairAddress ?? "");
      const nextAddr = String(p?.pairAddress ?? "");
      if (nextAddr && (!bestAddr || nextAddr < bestAddr)) {
        best = p;
      }
    }
  }

  return best ?? pairs[0] ?? null;
}

export async function searchDexScreenerPairs(input: {
  query: string;
  timeoutMs?: number;
}): Promise<{ pairs: DexScreenerPair[] }> {
  const query = String(input.query ?? "").trim();
  if (!query) return { pairs: [] };

  const timeoutMs = Math.max(500, Math.min(10_000, Number(input.timeoutMs ?? 3000) || 3000));

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = `${DEXSCREENER_BASE_URL}/latest/dex/search?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!res.ok) {
      throw new Error(`DexScreener search failed (${res.status})`);
    }

    const json = (await res.json().catch(() => null)) as DexScreenerSearchResponse | null;
    const pairs = Array.isArray(json?.pairs) ? json.pairs : [];
    return { pairs };
  } finally {
    clearTimeout(t);
  }
}

export async function fetchDexScreenerPairsByTokenMints(input: {
  tokenMints: string[];
  timeoutMs?: number;
}): Promise<{ pairs: DexScreenerPair[] }> {
  const tokenMints = (Array.isArray(input.tokenMints) ? input.tokenMints : [])
    .map((m) => String(m ?? "").trim())
    .filter(Boolean)
    .slice(0, 30);

  if (!tokenMints.length) return { pairs: [] };

  const timeoutMs = Math.max(500, Math.min(15_000, Number(input.timeoutMs ?? 5000) || 5000));

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = `${DEXSCREENER_BASE_URL}/latest/dex/tokens/${tokenMints.join(",")}`;
    const res = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!res.ok) {
      throw new Error(`DexScreener tokens request failed (${res.status})`);
    }

    const json = (await res.json().catch(() => null)) as DexScreenerTokenResponse | null;
    const pairs = Array.isArray(json?.pairs) ? json.pairs : [];
    return { pairs };
  } finally {
    clearTimeout(t);
  }
}

export function isBagsLaunchedToken(tokenMint: string): boolean {
  const mint = String(tokenMint ?? "").trim();
  return mint.length > 4 && mint.endsWith(BAGS_VANITY_SUFFIX);
}

export function filterBagsLaunchedPairs(pairs: DexScreenerPair[]): DexScreenerPair[] {
  return pairs.filter((p) => {
    const mint = String(p?.baseToken?.address ?? "").trim();
    return isBagsLaunchedToken(mint);
  });
}

export function filterByMinMarketCap(pairs: DexScreenerPair[], minMarketCap: number): DexScreenerPair[] {
  const min = Number(minMarketCap) || 0;
  if (min <= 0) return pairs;
  return pairs.filter((p) => {
    const mc = Number(p?.marketCap ?? 0);
    return Number.isFinite(mc) && mc >= min;
  });
}

export function filterByDex(pairs: DexScreenerPair[], dexId: string): DexScreenerPair[] {
  const dex = String(dexId ?? "").trim().toLowerCase();
  if (!dex) return pairs;
  return pairs.filter((p) => {
    const d = String(p?.dexId ?? "").trim().toLowerCase();
    return d === dex;
  });
}

export function sortByMarketCap(pairs: DexScreenerPair[], descending = true): DexScreenerPair[] {
  return [...pairs].sort((a, b) => {
    const mcA = Number(a?.marketCap ?? 0);
    const mcB = Number(b?.marketCap ?? 0);
    return descending ? mcB - mcA : mcA - mcB;
  });
}

export function sortByVolume24h(pairs: DexScreenerPair[], descending = true): DexScreenerPair[] {
  return [...pairs].sort((a, b) => {
    const volA = Number(a?.volume?.h24 ?? 0);
    const volB = Number(b?.volume?.h24 ?? 0);
    return descending ? volB - volA : volA - volB;
  });
}

export function deduplicateByBaseToken(pairs: DexScreenerPair[]): DexScreenerPair[] {
  const seen = new Map<string, DexScreenerPair>();
  for (const p of pairs) {
    const mint = String(p?.baseToken?.address ?? "").trim();
    if (!mint) continue;
    const existing = seen.get(mint);
    if (!existing) {
      seen.set(mint, p);
      continue;
    }
    const existingLiq = Number(existing?.liquidity?.usd ?? 0);
    const newLiq = Number(p?.liquidity?.usd ?? 0);
    if (newLiq > existingLiq) {
      seen.set(mint, p);
    }
  }
  return Array.from(seen.values());
}

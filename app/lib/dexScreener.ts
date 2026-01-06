type DexScreenerTokenResponse = {
  pairs?: DexScreenerPair[];
};

export type DexScreenerPair = {
  chainId?: string;
  dexId?: string;
  url?: string;
  pairAddress?: string;
  priceUsd?: string;
  liquidity?: { usd?: number };
  volume?: { h1?: number; h6?: number; h24?: number; m5?: number };
  fdv?: number;
  marketCap?: number;
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

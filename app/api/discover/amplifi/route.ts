import { NextRequest, NextResponse } from "next/server";
import { hasDatabase, getPool } from "@/app/lib/db";
import { getProjectProfilesByTokenMints } from "@/app/lib/projectProfilesStore";
import {
  fetchDexScreenerPairsByTokenMints,
  deduplicateByBaseToken,
  sortByMarketCap,
  filterByMinMarketCap,
  DexScreenerPair,
} from "@/app/lib/dexScreener";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 50;
const DEFAULT_MIN_MARKET_CAP = 0;

type AmpliFiLaunch = {
  commitmentId: string;
  tokenMint: string;
  statement?: string;
  creatorPubkey?: string;
  createdAtUnix: number;
  status: string;
};

async function getAmpliFiLaunches(): Promise<AmpliFiLaunch[]> {
  // Return empty until real AmpliFi launches exist
  // Old platform data (COD4, SHIP) should not be shown
  // When ready to enable, query commitments table with appropriate filters
  if (!hasDatabase()) return [];
  const pool = getPool();
  const res = await pool.query(
    `select id, token_mint, statement, creator_pubkey, created_at_unix, status
     from public.commitments
     where kind='creator_reward'
       and token_mint is not null
       and token_mint <> ''
       and status <> 'archived'
     order by created_at_unix desc
     limit 250`
  );

  return (res.rows ?? []).map((row) => ({
    commitmentId: String(row.id),
    tokenMint: String(row.token_mint),
    statement: row.statement == null ? undefined : String(row.statement),
    creatorPubkey: row.creator_pubkey == null ? undefined : String(row.creator_pubkey),
    createdAtUnix: Number(row.created_at_unix ?? 0) || 0,
    status: String(row.status ?? ""),
  }));
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const minMarketCapParam = searchParams.get("minMarketCap");
    const limitParam = searchParams.get("limit");
    const sortParam = searchParams.get("sort") ?? "marketCap";

    const minMarketCap = minMarketCapParam
      ? Math.max(0, Number(minMarketCapParam) || DEFAULT_MIN_MARKET_CAP)
      : DEFAULT_MIN_MARKET_CAP;

    const limit = limitParam
      ? Math.max(1, Math.min(100, Number(limitParam) || DEFAULT_LIMIT))
      : DEFAULT_LIMIT;

    const launches = await getAmpliFiLaunches();

    if (launches.length === 0) {
      return NextResponse.json({
        success: true,
        count: 0,
        tokens: [],
      });
    }

    const tokenMints = Array.from(new Set(launches.map((l) => l.tokenMint)));
    const launchByMint = new Map<string, AmpliFiLaunch>();
    for (const l of launches) {
      launchByMint.set(l.tokenMint, l);
    }

    const profiles = await getProjectProfilesByTokenMints(tokenMints).catch(() => []);
    const profileByMint = new Map<string, (typeof profiles)[number]>();
    for (const p of profiles) profileByMint.set(p.tokenMint, p);

    let pairs: DexScreenerPair[] = [];
    try {
      const batches: string[][] = [];
      for (let i = 0; i < tokenMints.length; i += 30) {
        batches.push(tokenMints.slice(i, i + 30));
      }

      for (const batch of batches) {
        const { pairs: batchPairs } = await fetchDexScreenerPairsByTokenMints({
          tokenMints: batch,
          timeoutMs: 8000,
        });
        pairs.push(...batchPairs);
      }
    } catch (e) {
      console.error("[discover/amplifi] DexScreener fetch failed:", e);
    }

    pairs = deduplicateByBaseToken(pairs);
    pairs = filterByMinMarketCap(pairs, minMarketCap);

    if (sortParam === "volume") {
      pairs = [...pairs].sort((a, b) => {
        const volA = Number(a?.volume?.h24 ?? 0);
        const volB = Number(b?.volume?.h24 ?? 0);
        return volB - volA;
      });
    } else if (sortParam === "newest") {
      pairs = [...pairs].sort((a, b) => {
        const launchA = launchByMint.get(a.baseToken?.address ?? "");
        const launchB = launchByMint.get(b.baseToken?.address ?? "");
        const timeA = launchA?.createdAtUnix ?? 0;
        const timeB = launchB?.createdAtUnix ?? 0;
        return timeB - timeA;
      });
    } else {
      pairs = sortByMarketCap(pairs, true);
    }

    pairs = pairs.slice(0, limit);

    const tokens = pairs.map((p) => {
      const mint = p.baseToken?.address ?? "";
      const launch = launchByMint.get(mint);
      const profile = profileByMint.get(mint);

      return {
        mint,
        name: profile?.name ?? p.baseToken?.name ?? "",
        symbol: profile?.symbol ?? p.baseToken?.symbol ?? "",
        bio: profile?.description ?? launch?.statement ?? null,
        priceUsd: p.priceUsd ?? null,
        marketCap: p.marketCap ?? null,
        fdv: p.fdv ?? null,
        volume24h: p.volume?.h24 ?? null,
        liquidity: p.liquidity?.usd ?? null,
        priceChange24h: p.priceChange?.h24 ?? null,
        pairAddress: p.pairAddress ?? null,
        dexScreenerUrl: p.url ?? null,
        imageUrl: profile?.imageUrl ?? p.info?.imageUrl ?? null,
        createdAt: p.pairCreatedAt
          ? new Date(p.pairCreatedAt).toISOString()
          : launch?.createdAtUnix
            ? new Date(launch.createdAtUnix * 1000).toISOString()
            : null,
        amplifi: launch
          ? {
              commitmentId: launch.commitmentId,
              statement: launch.statement ?? null,
              creatorPubkey: launch.creatorPubkey ?? null,
              launchedAt: new Date(launch.createdAtUnix * 1000).toISOString(),
              status: launch.status,
            }
          : null,
      };
    });

    const tokensWithoutMarketData = launches
      .filter((l) => !pairs.some((p) => p.baseToken?.address === l.tokenMint))
      .slice(0, Math.max(0, limit - tokens.length))
      .map((l) => {
        const profile = profileByMint.get(l.tokenMint);
        return {
        mint: l.tokenMint,
        name: profile?.name ?? null,
        symbol: profile?.symbol ?? null,
        bio: profile?.description ?? l.statement ?? null,
        priceUsd: null,
        marketCap: null,
        fdv: null,
        volume24h: null,
        liquidity: null,
        priceChange24h: null,
        pairAddress: null,
        dexScreenerUrl: null,
        imageUrl: profile?.imageUrl ?? null,
        createdAt: l.createdAtUnix ? new Date(l.createdAtUnix * 1000).toISOString() : null,
        amplifi: {
          commitmentId: l.commitmentId,
          statement: l.statement ?? null,
          creatorPubkey: l.creatorPubkey ?? null,
          launchedAt: new Date(l.createdAtUnix * 1000).toISOString(),
          status: l.status,
        },
      };
      });

    const allTokens = [...tokens, ...tokensWithoutMarketData].slice(0, limit);

    return NextResponse.json({
      success: true,
      count: allTokens.length,
      minMarketCap,
      tokens: allTokens,
    });
  } catch (error) {
    console.error("[discover/amplifi] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch AmpliFi launches" },
      { status: 500 }
    );
  }
}

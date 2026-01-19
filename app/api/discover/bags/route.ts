import { NextRequest, NextResponse } from "next/server";
import {
  getCachedBagsTokens,
  filterByMinMarketCap,
} from "@/app/lib/bagsCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_MIN_MARKET_CAP = 10_000;

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
      ? Math.max(1, Math.min(500, Number(limitParam) || 100))
      : 100; // Default to 100, max 500

    const allTokens = await getCachedBagsTokens();
    let tokens = filterByMinMarketCap(allTokens, minMarketCap);

    if (sortParam === "volume") {
      tokens = [...tokens].sort((a, b) => {
        const volA = Number(a?.volume24h ?? 0);
        const volB = Number(b?.volume24h ?? 0);
        return volB - volA;
      });
    }

    tokens = tokens.slice(0, limit);

    return NextResponse.json({
      success: true,
      count: tokens.length,
      minMarketCap,
      tokens,
    });
  } catch (error) {
    console.error("[discover/bags] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch Bags launches" },
      { status: 500 }
    );
  }
}

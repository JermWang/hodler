import { NextRequest, NextResponse } from "next/server";
import { refreshBagsCache } from "@/app/lib/bagsCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await refreshBagsCache();

    return NextResponse.json({
      success: true,
      count: result.count,
      error: result.error ?? null,
      refreshedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[cron/refresh-bags-cache] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to refresh Bags cache" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}

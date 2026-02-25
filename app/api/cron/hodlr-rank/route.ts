import { NextRequest, NextResponse } from "next/server";

import { runHodlrRankingShadow } from "@/app/lib/hodlr/rankingEngine";
import { getHodlrFlags } from "@/app/lib/hodlr/flags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isCronAuthorized(req: NextRequest): boolean {
  const expected = String(process.env.CRON_SECRET ?? "").trim();
  if (!expected) return false;
  const cronSecret = String(req.headers.get("x-cron-secret") ?? "").trim();
  const authHeader = String(req.headers.get("authorization") ?? "").trim();
  return cronSecret === expected || authHeader === `Bearer ${expected}`;
}

async function handle(req: NextRequest) {
  try {
    if (!isCronAuthorized(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const flags = getHodlrFlags();
    if (!flags.enabled) {
      return NextResponse.json({ ok: true, skipped: true, reason: "HODLR disabled" });
    }
    if (!flags.shadowMode) {
      return NextResponse.json({ ok: true, skipped: true, reason: "HODLR shadow mode disabled" });
    }

    const epochId = String(req.nextUrl.searchParams.get("epochId") ?? "").trim();
    const result = await runHodlrRankingShadow({ epochId: epochId || undefined });

    return NextResponse.json({ ...result, flags });
  } catch (e) {
    return NextResponse.json(
      { error: "HODLR ranking cron failed", details: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return handle(req);
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function HEAD(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return new NextResponse(null, { status: 401 });
  }
  return new NextResponse(null, { status: 200 });
}

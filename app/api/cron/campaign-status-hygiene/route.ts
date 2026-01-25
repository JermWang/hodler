import { NextRequest, NextResponse } from "next/server";

import { auditLog } from "@/app/lib/auditLog";
import { getPool, hasDatabase } from "@/app/lib/db";

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

function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

async function runCampaignStatusHygiene(req: NextRequest) {
  try {
    if (!isCronAuthorized(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasDatabase()) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    const ts = nowUnix();
    const pool = getPool();
    const result = await pool.query(
      `update public.campaigns
       set status = 'ended', updated_at_unix = $2
       where end_at_unix <= $1
         and status in ('active', 'paused', 'pending')
       returning id, token_mint, project_pubkey, end_at_unix`,
      [ts, ts]
    );

    const updated = result.rowCount ?? 0;
    const campaignIds = (result.rows ?? []).map((row: any) => String(row.id ?? "")).filter(Boolean);

    await auditLog("campaign_status_hygiene", {
      updated,
      campaignIds,
      endedAtUnix: ts,
    });

    return NextResponse.json({ ok: true, updated, campaignIds });
  } catch (error) {
    console.error("Failed to run campaign status hygiene:", error);
    return NextResponse.json({ error: "Failed to run campaign status hygiene" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return runCampaignStatusHygiene(req);
}

export async function GET(req: NextRequest) {
  return runCampaignStatusHygiene(req);
}

import { NextRequest, NextResponse } from "next/server";

import { getHodlrFlags } from "@/app/lib/hodlr/flags";
import { runHodlrDistributionDryRunShadow } from "@/app/lib/hodlr/distributionEngine";
import { runHodlrRankingShadow } from "@/app/lib/hodlr/rankingEngine";
import { getHodlrEpochById, getLatestHodlrEpoch, updateHodlrEpochStatus } from "@/app/lib/hodlr/store";

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

function parseBool(raw: string | null): boolean {
  const v = String(raw ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

async function handle(req: NextRequest) {
  try {
    if (!isCronAuthorized(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const flags = getHodlrFlags();
    if (!flags.enabled) {
      return NextResponse.json({ ok: true, skipped: true, reason: "HODLR disabled", flags });
    }
    if (!flags.shadowMode) {
      return NextResponse.json({ ok: true, skipped: true, reason: "HODLR shadow mode disabled", flags });
    }

    const epochIdParam = String(req.nextUrl.searchParams.get("epochId") ?? "").trim();
    const openClaims = parseBool(req.nextUrl.searchParams.get("openClaims"));
    const closeClaims = parseBool(req.nextUrl.searchParams.get("closeClaims"));

    const epoch = epochIdParam ? await getHodlrEpochById(epochIdParam) : await getLatestHodlrEpoch();
    if (!epoch) {
      return NextResponse.json({ ok: true, skipped: true, reason: "No HODLR epochs found", flags });
    }

    const steps: any[] = [];

    if (epoch.status === "finalized") {
      const r = await runHodlrRankingShadow({ epochId: epoch.id });
      steps.push({ step: "rank", result: r });
    } else if (epoch.status === "ranking_computed") {
      const r = await runHodlrDistributionDryRunShadow({ epochId: epoch.id });
      steps.push({ step: "distribution_dry_run", result: r });
    } else if (epoch.status === "distribution_dry_run" && openClaims) {
      const u = await updateHodlrEpochStatus({ epochId: epoch.id, status: "claim_open" });
      steps.push({ step: "claim_open", epoch: u });
    } else if (epoch.status === "claim_open" && closeClaims) {
      const u = await updateHodlrEpochStatus({ epochId: epoch.id, status: "claim_closed" });
      steps.push({ step: "claim_closed", epoch: u });
    } else {
      steps.push({ step: "noop", reason: `No action for status ${epoch.status}` });
    }

    const after = await getHodlrEpochById(epoch.id);

    return NextResponse.json({ ok: true, epochBefore: epoch, epochAfter: after, steps, flags });
  } catch (e) {
    return NextResponse.json(
      { error: "HODLR advance failed", details: e instanceof Error ? e.message : String(e) },
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

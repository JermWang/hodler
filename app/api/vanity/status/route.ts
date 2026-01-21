import { NextRequest, NextResponse } from "next/server";

import { checkRateLimit } from "../../../lib/rateLimit";
import { estimateVanityRefillSeconds, getVanityAvailableCount } from "../../../lib/vanityPool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getMinRequired(): number {
  const raw = Number(process.env.VANITY_LAUNCH_MIN_AVAILABLE ?? 1);
  if (!Number.isFinite(raw)) return 1;
  return Math.max(1, Math.floor(raw));
}

export async function GET(req: NextRequest) {
  const rl = await checkRateLimit(req, { keyPrefix: "vanity:status", limit: 120, windowSeconds: 60 });
  if (!rl.allowed) {
    const res = NextResponse.json({ error: "Rate limit exceeded", retryAfterSeconds: rl.retryAfterSeconds }, { status: 429 });
    res.headers.set("retry-after", String(rl.retryAfterSeconds));
    return res;
  }

  const url = new URL(req.url);
  const rawSuffix = String(url.searchParams.get("suffix") ?? "AMP").trim() || "AMP";
  const suffix = rawSuffix.toUpperCase() === "AMP" ? "AMP" : rawSuffix.toLowerCase() === "pump" ? "pump" : rawSuffix;

  const minRequired = getMinRequired();
  const available = await getVanityAvailableCount({ suffix });

  const needed = Math.max(0, minRequired - available);
  const eta = needed > 0 ? await estimateVanityRefillSeconds({ suffix, needed }) : { secondsPerMint: null, estimatedSecondsUntilReady: 0, sampleSize: 0 };

  return NextResponse.json({
    ok: true,
    suffix,
    available,
    minRequired,
    secondsPerMint: eta.secondsPerMint,
    estimatedSecondsUntilReady: eta.estimatedSecondsUntilReady,
    sampleSize: eta.sampleSize,
  });
}

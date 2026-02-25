import { NextResponse } from "next/server";

import { verifyAdminOrigin } from "../../lib/adminSession";

export const runtime = "nodejs";

export async function GET() {
  const res = NextResponse.json({ error: "Method Not Allowed. Use POST /api/launch." }, { status: 405 });
  res.headers.set("allow", "POST, OPTIONS");
  return res;
}

export async function OPTIONS(req: Request) {
  const expected = String(process.env.APP_ORIGIN ?? "").trim();
  const origin = req.headers.get("origin") ?? "";

  try {
    verifyAdminOrigin(req);
  } catch {
    const res = new NextResponse(null, { status: 204 });
    res.headers.set("allow", "POST, OPTIONS");
    return res;
  }

  const res = new NextResponse(null, { status: 204 });
  res.headers.set("allow", "POST, OPTIONS");
  res.headers.set("access-control-allow-origin", origin || expected);
  res.headers.set("access-control-allow-methods", "POST, OPTIONS");
  res.headers.set("access-control-allow-headers", "content-type");
  res.headers.set("access-control-allow-credentials", "true");
  res.headers.set("vary", "origin");
  return res;
}

const SOLANA_CAIP2 = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"; // mainnet

/**
 * POST /api/launch
 * 
 * Automated token launch flow:
 * 1. Creates a Privy-managed wallet (platform-controlled creator wallet)
 * 2. Uploads metadata to IPFS via Pump.fun
 * 3. Launches token on Pump.fun with the platform wallet as creator
 * 4. Creates a commitment record with milestones
 * 5. The platform wallet receives creator fees, which we auto-escrow
 */
export async function POST(req: Request) {
  return NextResponse.json(
    {
      error: "Deprecated endpoint. Use POST /api/launch/prepare then POST /api/launch/execute.",
    },
    { status: 410 }
  );
}

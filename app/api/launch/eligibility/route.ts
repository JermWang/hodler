import { NextResponse } from "next/server";

import { checkRateLimit } from "../../../lib/rateLimit";
import { getSafeErrorMessage } from "../../../lib/safeError";
import { getActiveManagedCommitmentByCreator } from "../../../lib/escrowStore";
import { withTraceJson } from "../../../lib/trace";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const json = (body: Record<string, unknown>, init?: ResponseInit) => withTraceJson(req, body, init);
    const rl = await checkRateLimit(req, { keyPrefix: "launch:eligibility", limit: 30, windowSeconds: 60 });
    if (!rl.allowed) {
      const res = json({ error: "Rate limit exceeded" }, { status: 429 });
      res.headers.set("retry-after", String(rl.retryAfterSeconds));
      return res;
    }

    const body = (await req.json().catch(() => null)) as any;
    const walletPubkey = typeof body?.walletPubkey === "string" ? body.walletPubkey.trim() : "";

    if (!walletPubkey) {
      return json({ error: "walletPubkey is required" }, { status: 400 });
    }

    const existingCommitment = await getActiveManagedCommitmentByCreator(walletPubkey);

    if (existingCommitment) {
      return json({
        eligible: false,
        reason: "wallet_has_managed_commitment",
        message: "This wallet already has an active managed launch. Each wallet is limited to one managed launch at a time.",
        existingCommitmentId: existingCommitment.id,
        existingTokenMint: existingCommitment.tokenMint || null,
      });
    }

    return json({
      eligible: true,
    });
  } catch (e) {
    return withTraceJson(req, { error: getSafeErrorMessage(e) }, { status: 500 });
  }
}

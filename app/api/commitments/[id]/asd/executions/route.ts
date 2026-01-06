import { NextResponse } from "next/server";

import { checkRateLimit } from "../../../../../lib/rateLimit";
import { getSafeErrorMessage } from "../../../../../lib/safeError";
import { listAsdExecutions } from "../../../../../lib/asdStore";

export const runtime = "nodejs";

export async function GET(req: Request, ctx: { params: { id: string } }) {
  try {
    const rl = await checkRateLimit(req, { keyPrefix: "asd:executions", limit: 120, windowSeconds: 60 });
    if (!rl.allowed) {
      const res = NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
      res.headers.set("retry-after", String(rl.retryAfterSeconds));
      return res;
    }

    const commitmentId = String(ctx?.params?.id ?? "").trim();
    if (!commitmentId) return NextResponse.json({ error: "Missing commitment id" }, { status: 400 });

    const u = new URL(req.url);
    const limitRaw = u.searchParams.get("limit");
    const limit = limitRaw ? Number(limitRaw) : 50;

    const execs = await listAsdExecutions({ commitmentId, limit: Number.isFinite(limit) ? Math.floor(limit) : 50 });

    return NextResponse.json({
      ok: true,
      commitmentId,
      executions: execs.map((e) => ({
        id: e.id,
        runAtUnix: e.runAtUnix,
        plannedAmountRaw: e.plannedAmountRaw,
        executedAmountRaw: e.executedAmountRaw,
        status: e.status,
        txSig: e.txSig ?? null,
        vaultPubkey: e.vaultPubkey ?? null,
        destinationPubkey: e.destinationPubkey,
        vaultBalanceRaw: e.vaultBalanceRaw ?? null,
        outMint: e.outMint ?? null,
        outAmountRaw: e.outAmountRaw ?? null,
        error: e.error ?? null,
      })),
    });
  } catch (e) {
    return NextResponse.json({ error: getSafeErrorMessage(e) }, { status: 500 });
  }
}

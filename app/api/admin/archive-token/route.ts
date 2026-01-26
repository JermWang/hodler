import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";

import { isAdminRequestAsync } from "../../../lib/adminAuth";
import { verifyAdminOrigin } from "../../../lib/adminSession";
import { auditLog } from "../../../lib/auditLog";
import { checkRateLimit } from "../../../lib/rateLimit";
import { getSafeErrorMessage } from "../../../lib/safeError";
import { getPool, hasDatabase } from "../../../lib/db";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const rl = await checkRateLimit(req, { keyPrefix: "admin:archive-token", limit: 20, windowSeconds: 60 });
    if (!rl.allowed) {
      const res = NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
      res.headers.set("retry-after", String(rl.retryAfterSeconds));
      return res;
    }

    try {
      verifyAdminOrigin(req);
    } catch (originErr) {
      await auditLog("admin_archive_token_denied", {
        reason: "origin_check_failed",
        error: String((originErr as Error).message),
      });
      return NextResponse.json({ error: "Origin check failed" }, { status: 403 });
    }

    if (!(await isAdminRequestAsync(req))) {
      await auditLog("admin_archive_token_denied", { reason: "unauthorized" });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as any;
    const tokenMintRaw = typeof body?.tokenMint === "string" ? body.tokenMint.trim() : "";

    if (!tokenMintRaw) {
      return NextResponse.json({ error: "tokenMint is required" }, { status: 400 });
    }

    let tokenMint: string;
    try {
      tokenMint = new PublicKey(tokenMintRaw).toBase58();
    } catch {
      return NextResponse.json({ error: "Invalid tokenMint" }, { status: 400 });
    }

    if (!hasDatabase()) {
      return NextResponse.json({ error: "Database not available" }, { status: 500 });
    }

    const pool = getPool();

    const commitmentResult = await pool.query(
      `UPDATE commitments
       SET status = 'archived'
       WHERE token_mint = $1
         AND status <> 'archived'
       RETURNING id, status`,
      [tokenMint]
    );

    const campaignResult = await pool.query(
      `UPDATE campaigns
       SET status = 'cancelled'
       WHERE token_mint = $1
         AND status NOT IN ('cancelled', 'ended')
       RETURNING id, status`,
      [tokenMint]
    );

    const archivedCommitments = commitmentResult.rowCount ?? 0;
    const cancelledCampaigns = campaignResult.rowCount ?? 0;

    if (archivedCommitments === 0 && cancelledCampaigns === 0) {
      const existingCommitment = await pool.query("select id, status from commitments where token_mint=$1 order by created_at_unix desc limit 1", [tokenMint]);
      const existingCampaign = await pool.query("select id, status from campaigns where token_mint=$1 order by created_at_unix desc limit 1", [tokenMint]);

      if ((existingCommitment.rowCount ?? 0) === 0 && (existingCampaign.rowCount ?? 0) === 0) {
        return NextResponse.json({ error: "No records found for this token mint", tokenMint }, { status: 404 });
      }

      return NextResponse.json({
        ok: true,
        tokenMint,
        archivedCommitments,
        cancelledCampaigns,
        message: "Token already archived/cancelled or no active records to archive",
        existingCommitment: existingCommitment.rows?.[0] ?? null,
        existingCampaign: existingCampaign.rows?.[0] ?? null,
      });
    }

    await auditLog("admin_archive_token_ok", {
      tokenMint,
      archivedCommitments,
      cancelledCampaigns,
      commitmentIds: commitmentResult.rows.map((r: any) => r.id),
      campaignIds: campaignResult.rows.map((r: any) => r.id),
    });

    return NextResponse.json({
      ok: true,
      tokenMint,
      archivedCommitments,
      cancelledCampaigns,
      message: `Archived ${archivedCommitments} commitment(s) and cancelled ${cancelledCampaigns} campaign(s) for token ${tokenMint.slice(0, 8)}...`,
    });
  } catch (e) {
    const rawError = String((e as any)?.message ?? e ?? "Unknown error");
    await auditLog("admin_archive_token_error", { error: getSafeErrorMessage(e), rawError });
    return NextResponse.json({ error: getSafeErrorMessage(e), rawError }, { status: 500 });
  }
}

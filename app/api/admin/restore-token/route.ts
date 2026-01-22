import { NextResponse } from "next/server";

import { isAdminRequestAsync } from "../../../lib/adminAuth";
import { verifyAdminOrigin } from "../../../lib/adminSession";
import { auditLog } from "../../../lib/auditLog";
import { checkRateLimit } from "../../../lib/rateLimit";
import { getSafeErrorMessage } from "../../../lib/safeError";
import { getPool, hasDatabase } from "../../../lib/db";

export const runtime = "nodejs";

function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

export async function POST(req: Request) {
  try {
    const rl = await checkRateLimit(req, { keyPrefix: "admin:restore-token", limit: 10, windowSeconds: 60 });
    if (!rl.allowed) {
      const res = NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
      res.headers.set("retry-after", String(rl.retryAfterSeconds));
      return res;
    }

    try {
      verifyAdminOrigin(req);
    } catch (originErr) {
      await auditLog("admin_restore_token_denied", { reason: "origin_check_failed", error: String((originErr as Error).message) });
      return NextResponse.json({ error: "Origin check failed" }, { status: 403 });
    }
    
    if (!(await isAdminRequestAsync(req))) {
      await auditLog("admin_restore_token_denied", { reason: "unauthorized" });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as any;
    const tokenMint = typeof body?.tokenMint === "string" ? body.tokenMint.trim() : "";
    
    if (!tokenMint) {
      return NextResponse.json({ error: "tokenMint is required" }, { status: 400 });
    }

    if (!hasDatabase()) {
      return NextResponse.json({ error: "Database not available" }, { status: 500 });
    }

    const pool = getPool();
    const now = nowUnix();

    // Find and restore archived commitment
    const commitmentResult = await pool.query(
      `UPDATE commitments 
       SET status = 'active'
       WHERE token_mint = $1 AND status = 'archived'
       RETURNING id, status`,
      [tokenMint]
    );

    // Find and restore archived/cancelled campaign
    const campaignResult = await pool.query(
      `UPDATE campaigns 
       SET status = 'active'
       WHERE token_mint = $1 AND status IN ('archived', 'cancelled')
       RETURNING id, status`,
      [tokenMint]
    );

    const restoredCommitments = commitmentResult.rowCount ?? 0;
    const restoredCampaigns = campaignResult.rowCount ?? 0;

    if (restoredCommitments === 0 && restoredCampaigns === 0) {
      // Check if there are any records at all for this token
      const existingCommitment = await pool.query(
        `SELECT id, status FROM commitments WHERE token_mint = $1`,
        [tokenMint]
      );
      const existingCampaign = await pool.query(
        `SELECT id, status FROM campaigns WHERE token_mint = $1`,
        [tokenMint]
      );

      if (existingCommitment.rowCount === 0 && existingCampaign.rowCount === 0) {
        return NextResponse.json({ 
          error: "No records found for this token mint. Use 'Add Existing Token' to create new records.",
          tokenMint,
        }, { status: 404 });
      }

      return NextResponse.json({ 
        ok: true,
        message: "Token already active or no archived records to restore",
        tokenMint,
        existingCommitment: existingCommitment.rows[0] ?? null,
        existingCampaign: existingCampaign.rows[0] ?? null,
      });
    }

    await auditLog("admin_restore_token_ok", {
      tokenMint,
      restoredCommitments,
      restoredCampaigns,
      commitmentIds: commitmentResult.rows.map((r: any) => r.id),
      campaignIds: campaignResult.rows.map((r: any) => r.id),
    });

    return NextResponse.json({ 
      ok: true, 
      tokenMint,
      restoredCommitments,
      restoredCampaigns,
      message: `Restored ${restoredCommitments} commitment(s) and ${restoredCampaigns} campaign(s) for token ${tokenMint.slice(0, 8)}...`
    });
  } catch (e) {
    const rawError = String((e as any)?.message ?? e ?? "Unknown error");
    await auditLog("admin_restore_token_error", { error: getSafeErrorMessage(e), rawError });
    return NextResponse.json({ error: getSafeErrorMessage(e), rawError }, { status: 500 });
  }
}

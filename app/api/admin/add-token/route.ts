import { NextResponse } from "next/server";
import crypto from "crypto";

import { isAdminRequestAsync } from "../../../lib/adminAuth";
import { verifyAdminOrigin } from "../../../lib/adminSession";
import { auditLog } from "../../../lib/auditLog";
import { checkRateLimit } from "../../../lib/rateLimit";
import { getSafeErrorMessage } from "../../../lib/safeError";
import { createRewardCommitmentRecord, insertCommitment } from "../../../lib/escrowStore";
import { upsertProjectProfile } from "../../../lib/projectProfilesStore";
import { getPool, hasDatabase } from "../../../lib/db";

export const runtime = "nodejs";

function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

export async function POST(req: Request) {
  try {
    const rl = await checkRateLimit(req, { keyPrefix: "admin:add-token", limit: 10, windowSeconds: 60 });
    if (!rl.allowed) {
      const res = NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
      res.headers.set("retry-after", String(rl.retryAfterSeconds));
      return res;
    }

    try {
      verifyAdminOrigin(req);
    } catch (originErr) {
      await auditLog("admin_add_token_denied", { reason: "origin_check_failed", error: String((originErr as Error).message) });
      return NextResponse.json({ error: "Origin check failed" }, { status: 403 });
    }
    
    if (!(await isAdminRequestAsync(req))) {
      await auditLog("admin_add_token_denied", { reason: "unauthorized" });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as any;
    
    const tokenMint = typeof body?.tokenMint === "string" ? body.tokenMint.trim() : "";
    const creatorWallet = typeof body?.creatorWallet === "string" ? body.creatorWallet.trim() : "";
    const privyWalletId = typeof body?.privyWalletId === "string" ? body.privyWalletId.trim() : "";
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const symbol = typeof body?.symbol === "string" ? body.symbol.trim() : "";
    const description = typeof body?.description === "string" ? body.description.trim() : "";
    const imageUrl = typeof body?.imageUrl === "string" ? body.imageUrl.trim() : "";
    const xUrl = typeof body?.xUrl === "string" ? body.xUrl.trim() : "";
    const websiteUrl = typeof body?.websiteUrl === "string" ? body.websiteUrl.trim() : "";
    const telegramUrl = typeof body?.telegramUrl === "string" ? body.telegramUrl.trim() : "";
    
    if (!tokenMint) {
      return NextResponse.json({ error: "tokenMint is required" }, { status: 400 });
    }
    
    if (!creatorWallet) {
      return NextResponse.json({ error: "creatorWallet is required" }, { status: 400 });
    }
    
    if (!privyWalletId) {
      return NextResponse.json({ error: "privyWalletId is required (for fee claims)" }, { status: 400 });
    }

    if (!hasDatabase()) {
      return NextResponse.json({ error: "Database not available" }, { status: 500 });
    }

    const pool = getPool();
    
    // Check if commitment already exists for this token
    const existingCommitment = await pool.query(
      `SELECT id, status FROM commitments WHERE token_mint = $1 AND status != 'archived'`,
      [tokenMint]
    );
    
    if (existingCommitment.rowCount && existingCommitment.rowCount > 0) {
      return NextResponse.json({ 
        error: "Commitment already exists for this token",
        existingId: existingCommitment.rows[0].id,
        status: existingCommitment.rows[0].status,
      }, { status: 409 });
    }

    const commitmentId = crypto.randomBytes(16).toString("hex");
    
    // Create commitment record
    const record = createRewardCommitmentRecord({
      id: commitmentId,
      statement: `Creator fees for ${name || tokenMint}`,
      creatorPubkey: creatorWallet,
      escrowPubkey: creatorWallet,
      escrowSecretKeyB58: `privy:${privyWalletId}`,
      milestones: [],
      tokenMint,
      creatorFeeMode: "managed",
    });

    // Override authority to be the creator wallet
    const recordWithAuthority = {
      ...record,
      authority: creatorWallet,
      destinationOnFail: creatorWallet,
    };

    await insertCommitment(recordWithAuthority);

    // Create/update project profile if we have metadata
    if (name || imageUrl) {
      try {
        await upsertProjectProfile({
          tokenMint,
          name: name || null,
          symbol: symbol || null,
          description: description || null,
          websiteUrl: websiteUrl || null,
          xUrl: xUrl || null,
          telegramUrl: telegramUrl || null,
          discordUrl: null,
          imageUrl: imageUrl || null,
          bannerUrl: null,
          metadataUri: null,
          createdByWallet: creatorWallet,
        });
      } catch (profileErr) {
        await auditLog("admin_add_token_profile_error", { 
          tokenMint, 
          error: getSafeErrorMessage(profileErr) 
        });
      }
    }

    // Create campaign record
    const campaignId = crypto.randomBytes(16).toString("hex");
    const now = nowUnix();
    const oneYearFromNow = now + 365 * 24 * 60 * 60;
    
    await pool.query(
      `INSERT INTO campaigns (
        id, project_pubkey, token_mint, name, description,
        start_at_unix, end_at_unix, epoch_duration_seconds,
        status, created_at_unix, updated_at_unix
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (id) DO NOTHING`,
      [
        campaignId,
        creatorWallet,
        tokenMint,
        name || `Campaign for ${tokenMint.slice(0, 8)}...`,
        description || null,
        now,
        oneYearFromNow,
        86400, // 1 day epochs
        "active",
        now,
        now,
      ]
    );

    await auditLog("admin_add_token_ok", {
      tokenMint,
      creatorWallet,
      privyWalletId,
      commitmentId,
      campaignId,
      name,
    });

    return NextResponse.json({ 
      ok: true, 
      commitmentId,
      campaignId,
      tokenMint,
      message: `Added token ${tokenMint} to system. It should now appear on discover page.`
    });
  } catch (e) {
    const rawError = String((e as any)?.message ?? e ?? "Unknown error");
    await auditLog("admin_add_token_error", { error: getSafeErrorMessage(e), rawError });
    return NextResponse.json({ error: getSafeErrorMessage(e), rawError }, { status: 500 });
  }
}

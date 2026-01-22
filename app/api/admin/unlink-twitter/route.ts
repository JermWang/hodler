import { NextResponse } from "next/server";

import { isAdminRequestAsync } from "../../../lib/adminAuth";
import { verifyAdminOrigin } from "../../../lib/adminSession";
import { auditLog } from "../../../lib/auditLog";
import { checkRateLimit } from "../../../lib/rateLimit";
import { getSafeErrorMessage } from "../../../lib/safeError";
import { getPool, hasDatabase } from "../../../lib/db";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const rl = await checkRateLimit(req, { keyPrefix: "admin:unlink-twitter", limit: 10, windowSeconds: 60 });
    if (!rl.allowed) {
      const res = NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
      res.headers.set("retry-after", String(rl.retryAfterSeconds));
      return res;
    }

    try {
      verifyAdminOrigin(req);
    } catch (originErr) {
      await auditLog("admin_unlink_twitter_denied", { reason: "origin_check_failed", error: String((originErr as Error).message) });
      return NextResponse.json({ error: "Origin check failed" }, { status: 403 });
    }
    
    if (!(await isAdminRequestAsync(req))) {
      await auditLog("admin_unlink_twitter_denied", { reason: "unauthorized" });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as any;
    const walletPubkey = typeof body?.walletPubkey === "string" ? body.walletPubkey.trim() : "";
    
    if (!walletPubkey) {
      return NextResponse.json({ error: "walletPubkey is required" }, { status: 400 });
    }

    if (!hasDatabase()) {
      return NextResponse.json({ error: "Database not available" }, { status: 500 });
    }

    const pool = getPool();
    
    // First, find the registration to log what we're deleting
    const findResult = await pool.query(
      `SELECT id, twitter_user_id, twitter_username 
       FROM holder_registrations 
       WHERE wallet_pubkey = $1`,
      [walletPubkey]
    );

    if (findResult.rowCount === 0) {
      return NextResponse.json({ 
        ok: false, 
        message: "No Twitter link found for this wallet." 
      });
    }

    const registration = findResult.rows[0];

    // Delete the registration to unlink Twitter
    await pool.query(
      `DELETE FROM holder_registrations WHERE wallet_pubkey = $1`,
      [walletPubkey]
    );

    await auditLog("admin_unlink_twitter_ok", {
      walletPubkey,
      twitterUserId: registration.twitter_user_id,
      twitterUsername: registration.twitter_username,
    });

    return NextResponse.json({ 
      ok: true, 
      unlinkedTwitter: registration.twitter_username,
      message: `Unlinked @${registration.twitter_username} from wallet. Twitter is now free to link to another wallet.`
    });
  } catch (e) {
    await auditLog("admin_unlink_twitter_error", { error: getSafeErrorMessage(e) });
    return NextResponse.json({ error: getSafeErrorMessage(e) }, { status: 500 });
  }
}

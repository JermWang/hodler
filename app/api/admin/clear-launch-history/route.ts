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
    const rl = await checkRateLimit(req, { keyPrefix: "admin:clear-launch-history", limit: 10, windowSeconds: 60 });
    if (!rl.allowed) {
      const res = NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
      res.headers.set("retry-after", String(rl.retryAfterSeconds));
      return res;
    }

    verifyAdminOrigin(req);
    if (!(await isAdminRequestAsync(req))) {
      await auditLog("admin_clear_launch_history_denied", { reason: "unauthorized" });
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
    
    // Archive all managed commitments for this wallet (set status to 'archived')
    const result = await pool.query(
      `UPDATE commitments 
       SET status = 'archived', updated_at_unix = $2
       WHERE creator_pubkey = $1 
         AND creator_fee_mode = 'managed' 
         AND status NOT IN ('archived')
       RETURNING id, token_mint, status`,
      [walletPubkey, Math.floor(Date.now() / 1000)]
    );

    const archivedCount = result.rowCount ?? 0;
    const archivedIds = result.rows.map((r: any) => ({ id: r.id, tokenMint: r.token_mint }));

    await auditLog("admin_clear_launch_history_ok", {
      walletPubkey,
      archivedCount,
      archivedIds,
    });

    return NextResponse.json({ 
      ok: true, 
      archivedCount, 
      archivedIds,
      message: archivedCount > 0 
        ? `Archived ${archivedCount} campaign(s). Wallet is now clear to launch.`
        : "No active campaigns found for this wallet."
    });
  } catch (e) {
    await auditLog("admin_clear_launch_history_error", { error: getSafeErrorMessage(e) });
    return NextResponse.json({ error: getSafeErrorMessage(e) }, { status: 500 });
  }
}

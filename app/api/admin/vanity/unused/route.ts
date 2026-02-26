import { NextResponse } from "next/server";
import { verifyAdminOrigin } from "../../../../lib/adminSession";
import { isAdminRequestAsync } from "../../../../lib/adminAuth";
import { getPool, hasDatabase } from "../../../../lib/db";

export const runtime = "nodejs";
export const revalidate = 0;

export async function GET(req: Request) {
  try {
    verifyAdminOrigin(req);
    if (!(await isAdminRequestAsync(req))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasDatabase()) {
      return NextResponse.json({ unusedVanityKeypairs: [] });
    }

    const pool = getPool();
    const result = await pool.query(`
      SELECT id, suffix, public_key, created_at_unix 
      FROM public.vanity_keypairs 
      WHERE used_at_unix IS NULL 
      ORDER BY created_at_unix DESC
      LIMIT 100
    `);

    return NextResponse.json({ unusedVanityKeypairs: result.rows });
  } catch (error: any) {
    console.error("[admin/vanity] Failed to fetch unused keypairs:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

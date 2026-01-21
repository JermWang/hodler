import { NextResponse } from "next/server";

import { isAdminRequestAsync } from "../../../../lib/adminAuth";
import { verifyAdminOrigin } from "../../../../lib/adminSession";
import { getPool, hasDatabase } from "../../../../lib/db";
import { getSafeErrorMessage } from "../../../../lib/safeError";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    verifyAdminOrigin(req);
    if (!(await isAdminRequestAsync(req))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasDatabase()) {
      return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    const url = new URL(req.url);
    const rawSuffix = String(url.searchParams.get("suffix") ?? "AMP").trim() || "AMP";
    if (rawSuffix.toUpperCase() !== "AMP") {
      return NextResponse.json({ error: 'Only vanity suffix "AMP" is supported', suffix: rawSuffix }, { status: 400 });
    }
    if (rawSuffix !== "AMP") {
      return NextResponse.json({ error: 'Suffix "AMP" must be uppercase' }, { status: 400 });
    }
    const suffix = "AMP";

    const pool = getPool();

    await pool.query(`
      create table if not exists public.vanity_keypairs (
        id bigserial primary key,
        suffix text not null,
        public_key text not null unique,
        secret_key text not null,
        created_at_unix bigint not null,
        used_at_unix bigint null
      );
      create index if not exists vanity_keypairs_suffix_used_idx on public.vanity_keypairs(suffix, used_at_unix);
    `);

    const [availRes, totalRes, usedRes] = await Promise.all([
      pool.query("select count(*)::bigint as n from public.vanity_keypairs where suffix=$1 and used_at_unix is null", [suffix]),
      pool.query("select count(*)::bigint as n from public.vanity_keypairs where suffix=$1", [suffix]),
      pool.query("select count(*)::bigint as n from public.vanity_keypairs where suffix=$1 and used_at_unix is not null", [suffix]),
    ]);

    const availableCount = Number(availRes.rows?.[0]?.n ?? 0);
    const totalCount = Number(totalRes.rows?.[0]?.n ?? 0);
    const usedCount = Number(usedRes.rows?.[0]?.n ?? 0);

    return NextResponse.json({ ok: true, suffix, availableCount, usedCount, totalCount });
  } catch (e) {
    return NextResponse.json({ error: getSafeErrorMessage(e) }, { status: 500 });
  }
}

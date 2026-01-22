import { NextResponse } from "next/server";

import { isAdminRequestAsync } from "../../../../lib/adminAuth";
import { verifyAdminOrigin } from "../../../../lib/adminSession";
import { getPool, hasDatabase } from "../../../../lib/db";
import { getSafeErrorMessage } from "../../../../lib/safeError";
import { filterInvalidAmpKeypairs } from "../../../../lib/vanityPool";

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

    const [availRes, totalRes, usedRes, upcomingRes] = await Promise.all([
      pool.query("select count(*)::bigint as n from public.vanity_keypairs where suffix=$1 and used_at_unix is null and reserved_at_unix is null", [suffix]),
      pool.query("select count(*)::bigint as n from public.vanity_keypairs where suffix=$1", [suffix]),
      pool.query("select count(*)::bigint as n from public.vanity_keypairs where suffix=$1 and used_at_unix is not null", [suffix]),
      pool.query(
        `select public_key, created_at_unix 
         from public.vanity_keypairs 
         where suffix=$1 and used_at_unix is null and reserved_at_unix is null
         order by created_at_unix asc 
         limit 10`,
        [suffix]
      ),
    ]);

    const availableCount = Number(availRes.rows?.[0]?.n ?? 0);
    const totalCount = Number(totalRes.rows?.[0]?.n ?? 0);
    const usedCount = Number(usedRes.rows?.[0]?.n ?? 0);
    
    // Get target from env (same as worker uses)
    const targetPoolSize = Math.max(1, Math.floor(Number(process.env.VANITY_WORKER_TARGET_AVAILABLE ?? 50)));
    
    const upcomingAddresses = (upcomingRes.rows ?? []).map((row: any, idx: number) => ({
      position: idx + 1,
      publicKey: String(row.public_key),
      createdAt: Number(row.created_at_unix),
    }));

    return NextResponse.json({ ok: true, suffix, availableCount, usedCount, totalCount, targetPoolSize, upcomingAddresses });
  } catch (e) {
    return NextResponse.json({ error: getSafeErrorMessage(e) }, { status: 500 });
  }
}

/**
 * POST /api/admin/vanity/pool
 * 
 * Cleanup invalid AMP vanity keypairs (those where the char before AMP is not lowercase).
 */
export async function POST(req: Request) {
  try {
    verifyAdminOrigin(req);
    if (!(await isAdminRequestAsync(req))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasDatabase()) {
      return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    const result = await filterInvalidAmpKeypairs();

    return NextResponse.json({
      ok: true,
      message: `Cleaned up ${result.removed} invalid AMP keypairs (kept ${result.kept})`,
      ...result,
    });
  } catch (e) {
    return NextResponse.json({ error: getSafeErrorMessage(e) }, { status: 500 });
  }
}

/**
 * PUT /api/admin/vanity/pool
 * 
 * Trigger the background worker to generate vanity keypairs to reach target.
 * Sets a "force_generate" flag that the worker checks on each loop.
 */
export async function PUT(req: Request) {
  try {
    verifyAdminOrigin(req);
    if (!(await isAdminRequestAsync(req))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasDatabase()) {
      return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    const suffix = "AMP";
    const targetPoolSize = Math.max(1, Math.floor(Number(process.env.VANITY_WORKER_TARGET_AVAILABLE ?? 50)));
    
    const pool = getPool();
    
    // Ensure flags table exists
    await pool.query(`
      create table if not exists public.vanity_worker_flags (
        key text primary key,
        value text,
        updated_at_unix bigint
      );
    `);
    
    // Get current available count
    const availRes = await pool.query(
      "select count(*)::bigint as n from public.vanity_keypairs where suffix=$1 and used_at_unix is null and reserved_at_unix is null",
      [suffix]
    );
    const currentAvailable = Number(availRes.rows?.[0]?.n ?? 0);
    
    if (currentAvailable >= targetPoolSize) {
      return NextResponse.json({
        ok: true,
        message: "Pool is already at target",
        flagSet: false,
        available: currentAvailable,
        target: targetPoolSize,
      });
    }

    // Set the force generate flag - worker will pick this up on next loop
    const nowUnix = Math.floor(Date.now() / 1000);
    await pool.query(
      `insert into public.vanity_worker_flags (key, value, updated_at_unix) 
       values ($1, 'true', $2) 
       on conflict (key) do update set value = 'true', updated_at_unix = $2`,
      [`force_generate_${suffix}`, nowUnix]
    );

    return NextResponse.json({
      ok: true,
      message: `Force generate flag set. Worker will generate ${targetPoolSize - currentAvailable} more addresses on next check.`,
      flagSet: true,
      available: currentAvailable,
      target: targetPoolSize,
      needed: targetPoolSize - currentAvailable,
    });
  } catch (e) {
    return NextResponse.json({ error: getSafeErrorMessage(e) }, { status: 500 });
  }
}

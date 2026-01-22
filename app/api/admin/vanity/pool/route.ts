import { NextResponse } from "next/server";
import { Keypair } from "@solana/web3.js";

import { isAdminRequestAsync } from "../../../../lib/adminAuth";
import { verifyAdminOrigin } from "../../../../lib/adminSession";
import { getPool, hasDatabase } from "../../../../lib/db";
import { getSafeErrorMessage } from "../../../../lib/safeError";
import { filterInvalidAmpKeypairs, insertVanityKeypair } from "../../../../lib/vanityPool";
import { isValidAmpVanityAddress } from "../../../../lib/vanityKeypair";

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
 * Trigger generation of vanity keypairs to reach target.
 * This is an admin override that generates server-side regardless of worker state.
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
        generated: 0,
        available: currentAvailable,
        target: targetPoolSize,
      });
    }

    const needed = targetPoolSize - currentAvailable;
    let generated = 0;
    const maxAttempts = 100_000_000; // Safety limit per address
    const batchSize = 50_000;

    // Generate addresses until we reach target
    for (let i = 0; i < needed; i++) {
      let attempts = 0;
      let found = false;

      while (!found && attempts < maxAttempts) {
        for (let j = 0; j < batchSize && attempts < maxAttempts; j++) {
          const kp = Keypair.generate();
          attempts++;
          const pub = kp.publicKey.toBase58();

          if (isValidAmpVanityAddress(pub)) {
            await insertVanityKeypair({ suffix, keypair: kp });
            generated++;
            found = true;
            break;
          }
        }
        // Yield to event loop
        await new Promise((r) => setTimeout(r, 0));
      }

      if (!found) {
        // Failed to find one after max attempts, return what we have
        break;
      }
    }

    // Get final count
    const finalRes = await pool.query(
      "select count(*)::bigint as n from public.vanity_keypairs where suffix=$1 and used_at_unix is null and reserved_at_unix is null",
      [suffix]
    );
    const finalAvailable = Number(finalRes.rows?.[0]?.n ?? 0);

    return NextResponse.json({
      ok: true,
      message: `Generated ${generated} vanity keypairs`,
      generated,
      available: finalAvailable,
      target: targetPoolSize,
    });
  } catch (e) {
    return NextResponse.json({ error: getSafeErrorMessage(e) }, { status: 500 });
  }
}

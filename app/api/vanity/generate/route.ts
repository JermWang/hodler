import { NextResponse } from "next/server";

import { isAdminRequestAsync } from "../../../lib/adminAuth";
import { verifyAdminOrigin } from "../../../lib/adminSession";
import { checkRateLimit } from "../../../lib/rateLimit";
import { auditLog } from "../../../lib/auditLog";
import { generateVanityKeypairAsync } from "../../../lib/vanityKeypair";
import { getVanityAvailableCount, insertVanityKeypair } from "../../../lib/vanityPool";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes max for vanity generation

/**
 * POST /api/vanity/generate
 * 
 * Generates a vanity keypair with a specific suffix (default: "pump").
 * Admin-only endpoint for pre-generating vanity addresses.
 * 
 * Body:
 * - suffix?: string (default: "pump")
 * - maxAttempts?: number (default: 50,000,000)
 * - addToCache?: boolean (default: true) - whether to add to global cache
 */
export async function POST(req: Request) {
  try {
    const rl = await checkRateLimit(req, { keyPrefix: "vanity:generate", limit: 5, windowSeconds: 300 });
    if (!rl.allowed) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    }

    verifyAdminOrigin(req);
    if (!(await isAdminRequestAsync(req))) {
      await auditLog("vanity_generate_denied", {});
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const suffixRaw = typeof body?.suffix === "string" ? body.suffix.trim() : "AMP";
    if (suffixRaw.toUpperCase() !== "AMP") {
      return NextResponse.json({ error: 'Only vanity suffix "AMP" is supported', suffix: suffixRaw }, { status: 400 });
    }
    if (suffixRaw !== "AMP") {
      return NextResponse.json({ error: 'Suffix "AMP" must be uppercase' }, { status: 400 });
    }

    const suffix = "AMP";
    const maxAttempts = typeof body?.maxAttempts === "number" ? body.maxAttempts : 50_000_000;

    if (suffix.length < 1 || suffix.length > 8) {
      return NextResponse.json({ error: "Suffix must be 1-8 characters" }, { status: 400 });
    }

    // Validate suffix contains only base58 characters
    const base58Chars = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    for (const char of suffix) {
      if (!base58Chars.includes(char)) {
        return NextResponse.json({ 
          error: `Invalid character '${char}' in suffix. Must be base58 characters only.` 
        }, { status: 400 });
      }
    }

    const startTime = Date.now();
    let attempts = 0;

    const caseSensitive = true;

    const keypair = await generateVanityKeypairAsync(
      suffix,
      maxAttempts,
      (count) => {
      attempts = count;
      },
      { caseSensitive }
    );

    const duration = Date.now() - startTime;

    if (!keypair) {
      await auditLog("vanity_generate_failed", { suffix, maxAttempts, duration });
      return NextResponse.json({ 
        error: `Failed to find keypair with suffix "${suffix}" after ${maxAttempts} attempts`,
        duration,
        attempts: maxAttempts
      }, { status: 404 });
    }

    try {
      await insertVanityKeypair({ suffix, keypair });
    } catch {
    }

    await auditLog("vanity_generate_success", { 
      suffix, 
      publicKey: keypair.publicKey.toBase58(),
      duration,
      attempts 
    });

    return NextResponse.json({
      ok: true,
      publicKey: keypair.publicKey.toBase58(),
      secretKey: Array.from(keypair.secretKey),
      suffix,
      duration,
      attempts
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await auditLog("vanity_generate_error", { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/vanity/generate
 * 
 * Get the current status of the vanity keypair cache.
 */
export async function GET(req: Request) {
  try {
    verifyAdminOrigin(req);
    if (!(await isAdminRequestAsync(req))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const suffix = "AMP";
    const available = await getVanityAvailableCount({ suffix });

    return NextResponse.json({ ok: true, suffix, available });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

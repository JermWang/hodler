import { NextResponse } from "next/server";
import { Keypair } from "@solana/web3.js";

import { isAdminRequestAsync } from "../../../../lib/adminAuth";
import { verifyAdminOrigin } from "../../../../lib/adminSession";
import { checkRateLimit } from "../../../../lib/rateLimit";
import { getSafeErrorMessage } from "../../../../lib/safeError";
import { insertVanityKeypair } from "../../../../lib/vanityPool";
import { getPumpVanityCache } from "../../../../lib/vanityKeypair";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const rl = await checkRateLimit(req, { keyPrefix: "admin:vanity:import", limit: 30, windowSeconds: 60 });
    if (!rl.allowed) {
      const res = NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
      res.headers.set("retry-after", String(rl.retryAfterSeconds));
      return res;
    }

    verifyAdminOrigin(req);
    if (!(await isAdminRequestAsync(req))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as any;
    const suffix = typeof body?.suffix === "string" ? body.suffix.trim() : "AMP";
    const secretKey = body?.secretKey;

    if (!suffix || suffix.length < 1 || suffix.length > 8) {
      return NextResponse.json({ error: "Suffix must be 1-8 characters" }, { status: 400 });
    }

    if (!Array.isArray(secretKey) || secretKey.length < 32) {
      return NextResponse.json({ error: "secretKey must be an array" }, { status: 400 });
    }

    const bytes = Uint8Array.from(secretKey.map((n: any) => Number(n)));
    const keypair = Keypair.fromSecretKey(bytes);

    const pubkeyStr = keypair.publicKey.toBase58();
    const suffixLower = suffix.toLowerCase();
    const suffixUpper = suffix.toUpperCase();
    if (suffixLower === "pump" && suffix !== "pump") {
      return NextResponse.json({ error: 'Suffix "pump" must be lowercase' }, { status: 400 });
    }
    if (suffixUpper === "AMP" && suffix !== "AMP") {
      return NextResponse.json({ error: 'Suffix "AMP" must be uppercase' }, { status: 400 });
    }
    if (suffix === "pump" && !pubkeyStr.endsWith("pump")) {
      return NextResponse.json({ error: 'Imported keypair does not end with "pump"' }, { status: 400 });
    }
    if (suffix === "AMP" && !pubkeyStr.endsWith("AMP")) {
      return NextResponse.json({ error: 'Imported keypair does not end with "AMP"' }, { status: 400 });
    }

    await insertVanityKeypair({ suffix, keypair });

    if (suffix.toLowerCase() === "pump") {
      try {
        const cache = getPumpVanityCache();
        cache.add(keypair);
      } catch {
      }
    }

    return NextResponse.json({ ok: true, publicKey: keypair.publicKey.toBase58(), suffix });
  } catch (e) {
    return NextResponse.json({ error: getSafeErrorMessage(e) }, { status: 500 });
  }
}

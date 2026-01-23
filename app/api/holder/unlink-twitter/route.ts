import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";

import { getPool, hasDatabase } from "@/app/lib/db";
import { auditLog } from "@/app/lib/auditLog";
import { checkRateLimit } from "@/app/lib/rateLimit";

export const runtime = "nodejs";

function expectedUnlinkMessage(input: { walletPubkey: string; timestampUnix: number }): string {
  return `AmpliFi\nUnlink Twitter\nWallet: ${input.walletPubkey}\nTimestamp: ${input.timestampUnix}`;
}

export async function POST(req: NextRequest) {
  try {
    const rl = await checkRateLimit(req, { keyPrefix: "holder:unlink-twitter", limit: 10, windowSeconds: 60 });
    if (!rl.allowed) {
      const res = NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
      res.headers.set("retry-after", String(rl.retryAfterSeconds));
      return res;
    }

    if (!hasDatabase()) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    const body = (await req.json().catch(() => null)) as any;
    const walletPubkey = typeof body?.walletPubkey === "string" ? body.walletPubkey.trim() : "";
    const signatureB58 = typeof body?.signatureB58 === "string" ? body.signatureB58.trim() : "";
    const timestampUnix = Number(body?.timestampUnix);

    if (!walletPubkey || !signatureB58 || !Number.isFinite(timestampUnix)) {
      return NextResponse.json(
        { error: "walletPubkey, signatureB58, and timestampUnix are required" },
        { status: 400 }
      );
    }

    const nowUnix = Math.floor(Date.now() / 1000);
    if (Math.abs(nowUnix - Math.floor(timestampUnix)) > 300) {
      return NextResponse.json({ error: "Signature timestamp expired" }, { status: 400 });
    }

    let walletPk: PublicKey;
    try {
      walletPk = new PublicKey(walletPubkey);
    } catch {
      return NextResponse.json({ error: "Invalid walletPubkey" }, { status: 400 });
    }

    let sigBytes: Uint8Array;
    try {
      sigBytes = bs58.decode(signatureB58);
    } catch {
      return NextResponse.json({ error: "Invalid signature encoding" }, { status: 400 });
    }

    const msg = expectedUnlinkMessage({ walletPubkey: walletPk.toBase58(), timestampUnix: Math.floor(timestampUnix) });
    const ok = nacl.sign.detached.verify(new TextEncoder().encode(msg), sigBytes, walletPk.toBytes());
    if (!ok) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const pool = getPool();

    const findResult = await pool.query(
      `SELECT id, twitter_user_id, twitter_username
       FROM public.holder_registrations
       WHERE wallet_pubkey = $1`,
      [walletPk.toBase58()]
    );

    if (findResult.rowCount === 0) {
      return NextResponse.json({ ok: true, message: "No Twitter link found for this wallet." });
    }

    const registration = findResult.rows[0];

    await pool.query(`DELETE FROM public.holder_registrations WHERE wallet_pubkey = $1`, [walletPk.toBase58()]);

    await auditLog("holder_unlink_twitter_ok", {
      walletPubkey: walletPk.toBase58(),
      twitterUserId: registration.twitter_user_id,
      twitterUsername: registration.twitter_username,
    });

    return NextResponse.json({
      ok: true,
      unlinkedTwitter: registration.twitter_username,
      message: `Unlinked @${registration.twitter_username} from wallet.`,
    });
  } catch (e) {
    await auditLog("holder_unlink_twitter_error", { error: String((e as any)?.message ?? e ?? "") });
    return NextResponse.json({ error: "Failed to unlink Twitter" }, { status: 500 });
  }
}

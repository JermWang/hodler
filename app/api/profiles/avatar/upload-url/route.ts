import { NextResponse } from "next/server";
import crypto from "crypto";

import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";

import { checkRateLimit } from "../../../../lib/rateLimit";
import { getSafeErrorMessage } from "../../../../lib/safeError";

export const runtime = "nodejs";

function requiredEnv(name: string): string {
  const v = String(process.env[name] ?? "").trim();
  if (!v) throw new Error(`${name} is required`);
  return v;
}

function baseSupabaseUrl(raw: string): string {
  return raw.replace(/\/+$/, "");
}

function supabaseStorageBaseUrl(): string {
  const supabaseUrl = baseSupabaseUrl(requiredEnv("SUPABASE_URL"));
  return `${supabaseUrl}/storage/v1`;
}

function expectedAvatarUploadMessage(input: { walletPubkey: string; timestampUnix: number; contentType: string }): string {
  return `Commit To Ship\nAvatar Upload\nWallet: ${input.walletPubkey}\nTimestamp: ${input.timestampUnix}\nContentType: ${input.contentType}`;
}

function extFromContentType(contentType: string): string {
  const ct = contentType.toLowerCase();
  if (ct.includes("image/png")) return "png";
  if (ct.includes("image/jpeg") || ct.includes("image/jpg")) return "jpg";
  if (ct.includes("image/webp")) return "webp";
  return "png";
}

export async function POST(req: Request) {
  try {
    const rl = checkRateLimit(req, { keyPrefix: "avatar:upload-url", limit: 20, windowSeconds: 60 });
    if (!rl.allowed) {
      const res = NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
      res.headers.set("retry-after", String(rl.retryAfterSeconds));
      return res;
    }

    const body = (await req.json().catch(() => null)) as any;

    const walletPubkeyRaw = typeof body?.walletPubkey === "string" ? body.walletPubkey.trim() : "";
    const timestampUnix = Number(body?.timestampUnix);
    const signatureB58 = typeof body?.signatureB58 === "string" ? body.signatureB58.trim() : "";
    const contentType = typeof body?.contentType === "string" ? body.contentType.trim() : "image/png";

    if (!walletPubkeyRaw) return NextResponse.json({ error: "walletPubkey is required" }, { status: 400 });
    if (!Number.isFinite(timestampUnix) || timestampUnix <= 0) {
      return NextResponse.json({ error: "timestampUnix is required" }, { status: 400 });
    }
    if (!signatureB58) return NextResponse.json({ error: "signatureB58 is required" }, { status: 400 });
    if (!contentType.toLowerCase().startsWith("image/")) {
      return NextResponse.json({ error: "contentType must be an image" }, { status: 400 });
    }

    const nowUnix = Math.floor(Date.now() / 1000);
    if (Math.abs(nowUnix - Math.floor(timestampUnix)) > 5 * 60) {
      return NextResponse.json({ error: "Signature timestamp expired" }, { status: 400 });
    }

    const walletPubkey = new PublicKey(walletPubkeyRaw).toBase58();

    const msg = expectedAvatarUploadMessage({ walletPubkey, timestampUnix: Math.floor(timestampUnix), contentType });
    const signature = bs58.decode(signatureB58);
    const ok = nacl.sign.detached.verify(new TextEncoder().encode(msg), signature, new PublicKey(walletPubkey).toBytes());
    if (!ok) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

    const bucket = String(process.env.SUPABASE_AVATAR_BUCKET ?? "avatars").trim() || "avatars";
    const ext = extFromContentType(contentType);
    const id = crypto.randomBytes(12).toString("hex");
    const path = `${walletPubkey}/${id}.${ext}`;

    const storageBase = supabaseStorageBaseUrl();
    const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");

    const createUrl = `${storageBase}/object/upload/sign/${encodeURIComponent(bucket)}/${path}`;

    const res = await fetch(createUrl, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
        "content-type": "application/json",
        "x-upsert": "true",
      },
      body: JSON.stringify({}),
    });

    const json = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) {
      return NextResponse.json({ error: json?.message ?? json?.error ?? `Storage request failed (${res.status})` }, { status: 500 });
    }

    const url = new URL(String(json?.url ?? ""), storageBase);
    const token = url.searchParams.get("token") || "";
    if (!token) {
      return NextResponse.json({ error: "Storage did not return token" }, { status: 500 });
    }

    const signedUrl = url.toString();
    const publicUrl = `${storageBase}/object/public/${encodeURIComponent(bucket)}/${path}`;

    return NextResponse.json({
      ok: true,
      bucket,
      path,
      token,
      signedUrl,
      publicUrl,
      expiresInSeconds: 2 * 60 * 60,
    });
  } catch (e) {
    return NextResponse.json({ error: getSafeErrorMessage(e) }, { status: 500 });
  }
}

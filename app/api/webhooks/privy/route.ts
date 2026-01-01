import crypto from "crypto";
import { NextResponse } from "next/server";

import { auditLog } from "../../../lib/auditLog";
import { getPool, hasDatabase } from "../../../lib/db";
import { getSafeErrorMessage } from "../../../lib/safeError";

export const runtime = "nodejs";

function mustGetWebhookSecret(): string {
  const raw = String(process.env.PRIVY_WEBHOOK_SIGNING_SECRET ?? "").trim();
  if (!raw) throw new Error("PRIVY_WEBHOOK_SIGNING_SECRET is required");
  return raw;
}

function parseSvixSignatures(header: string): string[] {
  const parts = header
    .split(" ")
    .map((p) => p.trim())
    .filter(Boolean);

  const out: string[] = [];
  for (const p of parts) {
    const [version, sig] = p.split(",");
    if (version === "v1" && sig) out.push(sig);
  }
  return out;
}

function timingSafeEqualBase64(a: string, b: string): boolean {
  try {
    const aa = Buffer.from(a, "base64");
    const bb = Buffer.from(b, "base64");
    if (aa.length !== bb.length) return false;
    return crypto.timingSafeEqual(aa, bb);
  } catch {
    return false;
  }
}

type SeenWebhook = { ts: number };
const seenWebhookIds: Map<string, SeenWebhook> = new Map();

function markAndCheckDuplicate(id: string): boolean {
  const now = Date.now();
  const existing = seenWebhookIds.get(id);
  if (existing) return true;

  seenWebhookIds.set(id, { ts: now });

  if (seenWebhookIds.size > 1000) {
    for (const [k, v] of seenWebhookIds) {
      if (now - v.ts > 10 * 60 * 1000) seenWebhookIds.delete(k);
    }
  }

  return false;
}

let ensuredSchema = false;

async function ensureSchema(): Promise<void> {
  if (ensuredSchema) return;
  if (!hasDatabase()) return;
  const pool = getPool();
  await pool.query(`
    create table if not exists public.privy_webhook_events (
      svix_id text primary key,
      received_at_unix bigint not null,
      event_type text null
    );
    create index if not exists privy_webhook_events_received_idx on public.privy_webhook_events(received_at_unix);
  `);
  ensuredSchema = true;
}

async function markAndCheckDuplicateDurable(input: { id: string; eventType: string }): Promise<boolean> {
  if (!hasDatabase()) {
    return markAndCheckDuplicate(input.id);
  }

  await ensureSchema();
  const pool = getPool();
  const nowUnix = Math.floor(Date.now() / 1000);

  const res = await pool.query(
    "insert into public.privy_webhook_events (svix_id, received_at_unix, event_type) values ($1,$2,$3) on conflict (svix_id) do nothing returning svix_id",
    [input.id, String(nowUnix), input.eventType || null]
  );

  return !res.rows[0];
}

function verifySvix(input: { body: string; id: string; timestamp: string; signature: string; secret: string }): boolean {
  const ts = Number(input.timestamp);
  if (!Number.isFinite(ts)) return false;

  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - ts) > 5 * 60) return false;

  const signedContent = `${input.id}.${input.timestamp}.${input.body}`;

  const secret = input.secret;
  const secretPart = secret.startsWith("whsec_") ? secret.split("_")[1] : secret;
  if (!secretPart) return false;

  const secretBytes = Buffer.from(secretPart, "base64");

  const expected = crypto.createHmac("sha256", secretBytes).update(signedContent, "utf8").digest("base64");

  const candidates = parseSvixSignatures(input.signature);
  if (!candidates.length) return false;

  return candidates.some((sig) => timingSafeEqualBase64(sig, expected));
}

function getStringField(obj: any, key: string): string {
  const v = obj?.[key];
  return typeof v === "string" ? v : "";
}

export async function POST(req: Request) {
  try {
    const secret = mustGetWebhookSecret();

    const id = req.headers.get("svix-id") ?? "";
    const timestamp = req.headers.get("svix-timestamp") ?? "";
    const signature = req.headers.get("svix-signature") ?? "";

    if (!id || !timestamp || !signature) {
      return NextResponse.json({ error: "Missing Svix headers" }, { status: 400 });
    }

    const body = await req.text();

    if (!verifySvix({ body, id, timestamp, signature, secret })) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const payload = JSON.parse(body) as any;
    const type = typeof payload?.type === "string" ? payload.type : "";

    const walletId = getStringField(payload, "wallet_id");
    const transactionId = getStringField(payload, "transaction_id");
    const caip2 = getStringField(payload, "caip2");
    const transactionHash = getStringField(payload, "transaction_hash");
    const isTransaction = type.startsWith("transaction.");
    const transactionStatus = isTransaction ? type.slice("transaction.".length) : "";

    if (await markAndCheckDuplicateDurable({ id, eventType: type })) {
      return NextResponse.json({ ok: true, duplicate: true });
    }

    await auditLog("privy_webhook_received", {
      type: type || null,
      svixId: id,
      svixTimestamp: timestamp,
      walletId: walletId || null,
      transactionId: transactionId || null,
      caip2: caip2 || null,
      transactionHash: transactionHash || null,
      transactionStatus: transactionStatus || null,
    });

    if (isTransaction && (transactionStatus === "failed" || transactionStatus === "provider_error" || transactionStatus === "execution_reverted")) {
      await auditLog("privy_transaction_error", {
        status: transactionStatus,
        walletId: walletId || null,
        transactionId: transactionId || null,
        caip2: caip2 || null,
        transactionHash: transactionHash || null,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    await auditLog("privy_webhook_error", { error: getSafeErrorMessage(e) });
    return NextResponse.json({ error: "Webhook handler error" }, { status: 500 });
  }
}

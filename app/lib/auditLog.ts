import { getPool, hasDatabase } from "./db";
import { redactSensitive } from "./safeError";

type AuditFields = Record<string, unknown>;

function safeString(v: unknown): string {
  return redactSensitive(String(v ?? ""));
}

function sanitizeValue(v: unknown): unknown {
  if (v == null) return v;
  if (typeof v === "string") return safeString(v);
  if (typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "bigint") return v.toString();
  if (Array.isArray(v)) return v.slice(0, 50).map(sanitizeValue);
  if (v instanceof Error) return safeString(v.message);
  if (typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as any)) {
      out[k] = sanitizeValue(val);
    }
    return out;
  }
  return safeString(v);
}

function sanitizeFields(fields: AuditFields): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = sanitizeValue(v);
  }
  return out;
}

function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

function shouldSendWebhook(event: string): boolean {
  const e = String(event ?? "").toLowerCase();
  if (!e) return false;
  if (e.includes("_error")) return true;
  if (e.includes("_denied")) return true;
  if (e.startsWith("admin_")) return true;
  return false;
}

let ensuredSchema: Promise<void> | null = null;

async function ensureSchema(): Promise<void> {
  if (!hasDatabase()) return;
  if (ensuredSchema) return ensuredSchema;

  ensuredSchema = (async () => {
    const pool = getPool();
    await pool.query(`
      create table if not exists public.audit_logs (
        id bigserial primary key,
        ts_unix bigint not null,
        event text not null,
        fields jsonb not null default '{}'::jsonb
      );
      create index if not exists audit_logs_ts_idx on public.audit_logs(ts_unix);
      create index if not exists audit_logs_event_idx on public.audit_logs(event);
    `);
  })().catch((e) => {
    ensuredSchema = null;
    throw e;
  });

  return ensuredSchema;
}

async function tryPostWebhook(payload: Record<string, unknown>): Promise<void> {
  const url = String(process.env.AUDIT_WEBHOOK_URL ?? "").trim();
  if (!url) return;
  if (!shouldSendWebhook(String(payload.event ?? ""))) return;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: controller.signal,
    });
  } catch {
    // ignore
  } finally {
    clearTimeout(timeout);
  }
}

async function tryInsertAuditLog(payload: Record<string, unknown>): Promise<void> {
  try {
    if (!hasDatabase()) return;
  } catch {
    return;
  }
  try {
    await ensureSchema();
    const pool = getPool();
    await pool.query("insert into public.audit_logs (ts_unix, event, fields) values ($1,$2,$3::jsonb)", [
      String(payload.ts_unix ?? nowUnix()),
      String(payload.event ?? ""),
      JSON.stringify(payload.fields ?? {}),
    ]);
  } catch {
    // ignore
  }
}

export async function auditLog(event: string, fields?: AuditFields): Promise<void> {
  try {
    const tsUnix = nowUnix();
    const sanitized = fields ? sanitizeFields(fields) : {};
    const payload: Record<string, unknown> = {
      ts: new Date(tsUnix * 1000).toISOString(),
      ts_unix: tsUnix,
      event,
      fields: sanitized,
    };

    try {
      console.log(JSON.stringify(payload));
    } catch {
      console.log(String(event ?? ""));
    }

    await tryInsertAuditLog(payload);
    void tryPostWebhook(payload);
  } catch {
    // ignore
  }
}

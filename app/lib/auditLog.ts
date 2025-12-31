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

export function auditLog(event: string, fields?: AuditFields): void {
  const payload: Record<string, unknown> = {
    ts: new Date().toISOString(),
    event,
    ...(fields ? sanitizeFields(fields) : {}),
  };
  console.log(JSON.stringify(payload));
}

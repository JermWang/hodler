import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

export function getTraceId(req?: Request): string {
  const header = String(req?.headers?.get("x-trace-id") ?? "").trim();
  if (header) return header;
  const cryptoRef = globalThis.crypto as Crypto | undefined;
  if (cryptoRef?.randomUUID) return cryptoRef.randomUUID();
  return `${Date.now().toString(36)}${Math.random().toString(16).slice(2, 10)}`;
}

export function withTraceJson(req: Request | undefined, body: Record<string, unknown>, init?: ResponseInit) {
  const traceId = getTraceId(req);
  try {
    Sentry.setTag("trace_id", traceId);
  } catch {
    // ignore
  }
  const payload = { ...body, traceId };
  const res = NextResponse.json(payload, init);
  res.headers.set("x-trace-id", traceId);
  return res;
}

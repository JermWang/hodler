import { NextRequest, NextResponse } from "next/server";

function buildTraceId(req: NextRequest): string {
  const existing = String(req.headers.get("x-trace-id") ?? "").trim();
  if (existing) return existing;
  const cryptoRef = globalThis.crypto as Crypto | undefined;
  if (cryptoRef?.randomUUID) return cryptoRef.randomUUID();
  return `${Date.now().toString(36)}${Math.random().toString(16).slice(2, 10)}`;
}

export function middleware(req: NextRequest) {
  const traceId = buildTraceId(req);
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-trace-id", traceId);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("x-trace-id", traceId);
  return res;
}

export const config = {
  matcher: "/api/:path*",
};

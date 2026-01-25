import { NextResponse } from "next/server";

export function withTraceJson(_req: Request | undefined, body: Record<string, unknown>, init?: ResponseInit) {
  return NextResponse.json(body, init);
}

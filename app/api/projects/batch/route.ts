import { NextResponse } from "next/server";

import { getProjectProfilesByTokenMints } from "../../../lib/projectProfilesStore";
import { getSafeErrorMessage } from "../../../lib/safeError";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as any;
    const tokenMints = Array.isArray(body?.tokenMints) ? body.tokenMints : [];

    if (tokenMints.length > 80) {
      return NextResponse.json({ error: "Too many tokenMints" }, { status: 400 });
    }

    const projects = await getProjectProfilesByTokenMints(tokenMints);
    return NextResponse.json({ projects });
  } catch (e) {
    return NextResponse.json({ error: getSafeErrorMessage(e) }, { status: 500 });
  }
}

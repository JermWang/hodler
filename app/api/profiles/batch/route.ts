import { NextResponse } from "next/server";

import { getProfilesByWalletPubkeys } from "../../../lib/profilesStore";
import { getSafeErrorMessage } from "../../../lib/safeError";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as any;
    const walletPubkeys = Array.isArray(body?.walletPubkeys) ? body.walletPubkeys : [];

    if (walletPubkeys.length > 80) {
      return NextResponse.json({ error: "Too many walletPubkeys" }, { status: 400 });
    }

    const profiles = await getProfilesByWalletPubkeys(walletPubkeys);
    return NextResponse.json({ profiles });
  } catch (e) {
    return NextResponse.json({ error: getSafeErrorMessage(e) }, { status: 500 });
  }
}

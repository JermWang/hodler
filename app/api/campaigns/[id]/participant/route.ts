import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";

import { getPool, hasDatabase } from "@/app/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: { id: string } }) {
  try {
    if (!hasDatabase()) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    const campaignId = String(ctx?.params?.id ?? "").trim();
    if (!campaignId) return NextResponse.json({ error: "Campaign id required" }, { status: 400 });

    const { searchParams } = new URL(req.url);
    const walletPubkey = String(searchParams.get("walletPubkey") ?? "").trim();
    if (!walletPubkey) {
      return NextResponse.json({ error: "walletPubkey is required" }, { status: 400 });
    }

    let walletPk: PublicKey;
    try {
      walletPk = new PublicKey(walletPubkey);
    } catch {
      return NextResponse.json({ error: "Invalid walletPubkey" }, { status: 400 });
    }

    const pool = getPool();
    const res = await pool.query(
      `select registration_id, token_balance_snapshot, opted_in_at_unix
       from public.campaign_participants
       where campaign_id=$1 and wallet_pubkey=$2 and status='active'
       limit 1`,
      [campaignId, walletPk.toBase58()]
    );

    if ((res.rows ?? []).length === 0) {
      return NextResponse.json({ joined: false });
    }

    const row = res.rows[0];
    return NextResponse.json({
      joined: true,
      optedInAtUnix: Number(row.opted_in_at_unix ?? 0) || 0,
    });
  } catch (e) {
    console.error("Failed to fetch campaign participant:", e);
    return NextResponse.json({ error: "Failed to fetch participant" }, { status: 500 });
  }
}

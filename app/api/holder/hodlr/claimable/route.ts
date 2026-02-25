import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";

import { hasDatabase } from "@/app/lib/db";
import { getSafeErrorMessage } from "@/app/lib/safeError";
import { getHodlrFlags } from "@/app/lib/hodlr/flags";
import { listHodlrClaimableDistributionsByWallet } from "@/app/lib/hodlr/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const walletPubkey = searchParams.get("wallet")?.trim() ?? "";

    if (!walletPubkey) {
      return NextResponse.json({ error: "wallet required" }, { status: 400 });
    }

    try {
      new PublicKey(walletPubkey);
    } catch {
      return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
    }

    const flags = getHodlrFlags();
    if (!flags.enabled) {
      return NextResponse.json({ ok: true, wallet: walletPubkey, hodlr: { available: false, claimableLamports: "0", claimableEpochIds: [] }, flags });
    }

    if (!hasDatabase()) {
      return NextResponse.json({ ok: true, wallet: walletPubkey, hodlr: { available: false, claimableLamports: "0", claimableEpochIds: [] }, flags });
    }

    const rows = await listHodlrClaimableDistributionsByWallet({ walletPubkey });
    const claimableLamports = rows.reduce((sum, r) => sum + BigInt(String(r.amountLamports ?? "0")), 0n);

    return NextResponse.json({
      ok: true,
      wallet: walletPubkey,
      hodlr: {
        available: claimableLamports > 0n,
        claimableLamports: claimableLamports.toString(),
        claimableSol: Number(claimableLamports) / 1e9,
        claimableEpochIds: rows.map((r) => r.epochId),
      },
      flags,
    });
  } catch (e) {
    return NextResponse.json({ error: getSafeErrorMessage(e) }, { status: 500 });
  }
}

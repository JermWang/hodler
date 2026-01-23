import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";

import { hasDatabase } from "@/app/lib/db";
import { computePumpfunSolClaimability, getClaimableRewards } from "@/app/lib/epochSettlement";
import { getSafeErrorMessage } from "@/app/lib/safeError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/holder/claimable?wallet=...
 * 
 * Returns unified claimable balances from all platforms:
 * - Pump.fun campaigns (epoch rewards)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const walletPubkey = searchParams.get("wallet")?.trim() ?? "";

    if (!walletPubkey) {
      return NextResponse.json({ error: "wallet required" }, { status: 400 });
    }

    // Validate wallet
    try {
      new PublicKey(walletPubkey);
    } catch {
      return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
    }

    const result: {
      pumpfun: {
        available: boolean;
        pendingLamports: string;
        availableLamports: string;
        thresholdLamports: string;
        thresholdMet: boolean;
        pendingRewardCount: number;
        availableRewardCount: number;
        availableEpochIds: string[];
      };
      totalClaimableLamports: string;
      totalClaimableSol: number;
    } = {
      pumpfun: {
        available: false,
        pendingLamports: "0",
        availableLamports: "0",
        thresholdLamports: "0",
        thresholdMet: false,
        pendingRewardCount: 0,
        availableRewardCount: 0,
        availableEpochIds: [],
      },
      totalClaimableLamports: "0",
      totalClaimableSol: 0,
    };

    if (hasDatabase()) {
      try {
        const rewards = await getClaimableRewards(walletPubkey);
        const claimability = computePumpfunSolClaimability({ rewards });

        result.pumpfun = {
          available: claimability.availableLamports > 0n,
          pendingLamports: claimability.pendingLamports.toString(),
          availableLamports: claimability.availableLamports.toString(),
          thresholdLamports: claimability.thresholdLamports.toString(),
          thresholdMet: claimability.thresholdMet,
          pendingRewardCount: claimability.pendingRewardCount,
          availableRewardCount: claimability.availableRewardCount,
          availableEpochIds: claimability.availableEpochIds,
        };

        result.totalClaimableLamports = claimability.availableLamports.toString();
        result.totalClaimableSol = Number(claimability.availableLamports) / 1e9;
      } catch (e) {
        console.error("[holder/claimable] Pump.fun rewards error:", e);
      }
    }

    return NextResponse.json({
      ok: true,
      wallet: walletPubkey,
      pumpfun: result.pumpfun,
      totalClaimableLamports: result.totalClaimableLamports,
      totalClaimableSol: result.totalClaimableSol,
    });
  } catch (e) {
    return NextResponse.json({ error: getSafeErrorMessage(e) }, { status: 500 });
  }
}

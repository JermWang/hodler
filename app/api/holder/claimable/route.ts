import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";

import { hasDatabase } from "@/app/lib/db";
import { getClaimableRewards } from "@/app/lib/epochSettlement";
import { getClaimableBalances, hasBagsApiKey } from "@/app/lib/bags";
import { getSafeErrorMessage } from "@/app/lib/safeError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/holder/claimable?wallet=...
 * 
 * Returns unified claimable balances from all platforms:
 * - AmpliFi epoch rewards (campaigns)
 * - Bags.fm fee shares
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
      amplifi: {
        available: boolean;
        totalLamports: number;
        rewardCount: number;
        rewards: Array<{
          epochId: string;
          campaignId: string;
          campaignName: string;
          rewardLamports: string;
          claimed: boolean;
        }>;
      };
      bags: {
        available: boolean;
        totalLamports: number;
        positionCount: number;
        positions: Array<{
          baseMint: string;
          claimableLamports: number;
        }>;
        error?: string;
      };
      totalClaimableLamports: number;
      totalClaimableSol: number;
    } = {
      amplifi: {
        available: false,
        totalLamports: 0,
        rewardCount: 0,
        rewards: [],
      },
      bags: {
        available: false,
        totalLamports: 0,
        positionCount: 0,
        positions: [],
      },
      totalClaimableLamports: 0,
      totalClaimableSol: 0,
    };

    // Fetch AmpliFi epoch rewards
    if (hasDatabase()) {
      try {
        const rewards = await getClaimableRewards(walletPubkey);
        const unclaimedRewards = rewards.filter(r => !r.claimed && r.rewardLamports > 0n);
        
        result.amplifi = {
          available: true,
          totalLamports: unclaimedRewards.reduce((sum, r) => sum + Number(r.rewardLamports), 0),
          rewardCount: unclaimedRewards.length,
          rewards: unclaimedRewards.map(r => ({
            epochId: r.epochId,
            campaignId: r.campaignId,
            campaignName: r.campaignName || "Campaign",
            rewardLamports: r.rewardLamports.toString(),
            claimed: r.claimed,
          })),
        };
      } catch (e) {
        console.error("[holder/claimable] AmpliFi rewards error:", e);
      }
    }

    // Fetch Bags.fm claimable balances
    if (hasBagsApiKey()) {
      try {
        const bagsResult = await getClaimableBalances(walletPubkey);
        
        if (bagsResult.ok && bagsResult.positions) {
          result.bags = {
            available: true,
            totalLamports: bagsResult.totalLamports || 0,
            positionCount: bagsResult.positions.length,
            positions: bagsResult.positions.map(p => ({
              baseMint: p.baseMint,
              claimableLamports: Number(p.totalClaimableLamportsUserShare || 0),
            })),
          };
        } else {
          result.bags.error = bagsResult.error;
        }
      } catch (e) {
        console.error("[holder/claimable] Bags error:", e);
        result.bags.error = getSafeErrorMessage(e);
      }
    }

    // Calculate totals
    result.totalClaimableLamports = result.amplifi.totalLamports + result.bags.totalLamports;
    result.totalClaimableSol = result.totalClaimableLamports / 1e9;

    return NextResponse.json({
      ok: true,
      wallet: walletPubkey,
      ...result,
    });
  } catch (e) {
    return NextResponse.json({ error: getSafeErrorMessage(e) }, { status: 500 });
  }
}

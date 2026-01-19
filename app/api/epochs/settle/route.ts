import { NextRequest, NextResponse } from "next/server";
import { settleAllReadyEpochs } from "@/app/lib/epochSettlement";
import { hasDatabase } from "@/app/lib/db";

/**
 * POST /api/epochs/settle
 * 
 * Settle all epochs that are ready for settlement.
 * This should be called by a cron job or admin action.
 * 
 * Requires CRON_SECRET header for authentication.
 */
export async function POST(req: NextRequest) {
  try {
    // Verify cron secret
    const cronSecret = req.headers.get("x-cron-secret");
    const expectedSecret = process.env.CRON_SECRET;

    if (!expectedSecret || cronSecret !== expectedSecret) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    if (!hasDatabase()) {
      return NextResponse.json(
        { error: "Database not available" },
        { status: 503 }
      );
    }

    const results = await settleAllReadyEpochs();

    // Serialize BigInt values
    const serializedResults = results.map((r) => ({
      ...r,
      totalDistributedLamports: r.totalDistributedLamports.toString(),
      rewards: r.rewards.map((reward) => ({
        ...reward,
        rewardLamports: reward.rewardLamports.toString(),
      })),
    }));

    return NextResponse.json({
      settled: serializedResults.length,
      results: serializedResults,
    });
  } catch (error) {
    console.error("Failed to settle epochs:", error);
    return NextResponse.json(
      { error: "Failed to settle epochs" },
      { status: 500 }
    );
  }
}

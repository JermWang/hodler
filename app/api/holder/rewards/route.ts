import { NextRequest, NextResponse } from "next/server";

import { getClaimableRewards, getHolderStats } from "@/app/lib/epochSettlement";
import { getPool, hasDatabase } from "@/app/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/holder/rewards
 * 
 * Get claimable rewards and stats for a holder
 */
function lamportsToSolString(lamports: bigint, decimals: number = 2): string {
  const n = Number(lamports) / 1e9;
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

async function getWalletFromRequest(req: NextRequest): Promise<string | null> {
  if (req.method === "GET") {
    const { searchParams } = new URL(req.url);
    const wallet = searchParams.get("wallet");
    return wallet ? String(wallet).trim() : null;
  }

  if (req.method === "POST") {
    const body = (await req.json().catch(() => null)) as any;
    const wallet = typeof body?.walletPubkey === "string" ? body.walletPubkey.trim() : "";
    return wallet || null;
  }

  return null;
}

async function getHistory(walletPubkey: string): Promise<
  Array<{ id: string; campaignName: string; amount: string; epochNumber: number; claimedAt: number; txSig?: string }>
> {
  if (!hasDatabase()) return [];
  const pool = getPool();
  const res = await pool.query(
    `SELECT
       rc.id,
       rc.amount_lamports,
       rc.tx_sig,
       rc.claimed_at_unix,
       e.epoch_number,
       c.name as campaign_name
     FROM public.reward_claims rc
     JOIN public.epochs e ON e.id = rc.epoch_id
     JOIN public.campaigns c ON c.id = e.campaign_id
     WHERE rc.wallet_pubkey = $1
     ORDER BY rc.claimed_at_unix DESC
     LIMIT 200`,
    [walletPubkey]
  );

  return res.rows.map((row) => {
    const lamports = BigInt(row.amount_lamports ?? "0");
    return {
      id: String(row.id),
      campaignName: String(row.campaign_name ?? ""),
      amount: lamportsToSolString(lamports, 2),
      epochNumber: Number(row.epoch_number ?? 0),
      claimedAt: Number(row.claimed_at_unix ?? 0),
      txSig: row.tx_sig ? String(row.tx_sig) : undefined,
    };
  });
}

async function handle(req: NextRequest) {
  try {
    const walletPubkey = await getWalletFromRequest(req);

    if (!walletPubkey) {
      return NextResponse.json({ error: "Missing wallet" }, { status: 400 });
    }

    if (!hasDatabase()) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    const [rewards, stats, history] = await Promise.all([
      getClaimableRewards(walletPubkey),
      getHolderStats(walletPubkey),
      getHistory(walletPubkey),
    ]);

    const claimableLamports = rewards
      .filter((r) => !r.claimed)
      .reduce((sum, r) => sum + r.rewardLamports, 0n);

    // Holder dashboard (GET consumer)
    const serializedRewards = rewards.map((r) => ({
      ...r,
      rewardLamports: r.rewardLamports.toString(),
    }));

    const serializedStats = {
      ...stats,
      totalEarned: stats.totalEarned.toString(),
      totalClaimed: stats.totalClaimed.toString(),
      totalPending: stats.totalPending.toString(),
    };

    // Legacy dashboard (POST consumer)
    const legacyStats = {
      totalEarned: lamportsToSolString(stats.totalEarned, 2),
      claimableRewards: lamportsToSolString(claimableLamports, 2),
      activeCampaigns: stats.campaignsJoined,
      totalEngagements: stats.totalEngagements,
    };

    if (req.method === "POST") {
      return NextResponse.json({ stats: legacyStats, history });
    }

    return NextResponse.json({ rewards: serializedRewards, stats: serializedStats, history });
  } catch (error) {
    console.error("Failed to fetch holder rewards:", error);
    return NextResponse.json({ error: "Failed to fetch rewards" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}

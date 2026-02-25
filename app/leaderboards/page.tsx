import { Trophy, Clock, Coins, TrendingUp } from "lucide-react";
import Link from "next/link";

import { HodlrLayout } from "@/app/components/hodlr";
import {
  getLatestHodlrEpoch,
  getHodlrTopEarners,
  listHodlrRankings,
  listHodlrEpochs,
} from "@/app/lib/hodlr/store";
import LeaderboardsClient from "./client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function shortPk(pk: string): string {
  const s = String(pk ?? "").trim();
  if (s.length <= 10) return s;
  return `${s.slice(0, 4)}...${s.slice(-4)}`;
}

function lamportsToSol(lamports: string): string {
  try {
    const val = BigInt(lamports || "0");
    const sol = Number(val) / 1e9;
    return sol.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  } catch {
    return "0";
  }
}

function formatBalance(raw: string): string {
  try {
    const val = BigInt(raw || "0");
    const num = Number(val) / 1e9;
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`;
    return num.toFixed(2);
  } catch {
    return raw;
  }
}

export default async function LeaderboardsPage() {
  let latest: Awaited<ReturnType<typeof getLatestHodlrEpoch>> = null;
  let topEarners: Awaited<ReturnType<typeof getHodlrTopEarners>> = [];
  let recentEpochs: Awaited<ReturnType<typeof listHodlrEpochs>> = [];
  let rankings: Awaited<ReturnType<typeof listHodlrRankings>> = [];

  try {
    const res = await Promise.all([
      getLatestHodlrEpoch(),
      getHodlrTopEarners(50),
      listHodlrEpochs({ limit: 5 }),
    ]);
    latest = res[0];
    topEarners = res[1];
    recentEpochs = res[2];

    const epochId = latest?.id ?? "";
    rankings = epochId ? await listHodlrRankings(epochId) : [];
  } catch (e) {
    console.error("Failed to load HODLR leaderboards", e);
  }

  return (
    <HodlrLayout>
      <div className="px-4 md:px-6 pt-6 pb-12">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Trophy className="h-6 w-6 text-amber-400" />
              <h1 className="text-2xl font-bold text-white">Leaderboards</h1>
            </div>
            <p className="text-sm text-[#9AA3B2]">Top holders ranked by holding duration and balance weight</p>
          </div>
          {latest && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-[#9AA3B2]">Epoch</span>
              <span className="font-mono text-sm font-semibold text-white">#{latest.epochNumber}</span>
              <span className={`text-xs px-2 py-0.5 rounded border ${
                latest.status === "claim_open"
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                  : "bg-white/[0.03] text-[#9AA3B2] border-white/5"
              }`}>
                {latest.status}
              </span>
            </div>
          )}
        </div>

        {/* Tabs + Content */}
        <LeaderboardsClient
          rankings={rankings}
          topEarners={topEarners}
          recentEpochs={recentEpochs}
          latestEpochNumber={latest?.epochNumber ?? 0}
        />
      </div>
    </HodlrLayout>
  );
}

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
      <div className="px-5 md:px-7 pt-7 pb-14">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-7">
          <div>
            <h1 className="text-xl font-black text-white tracking-tight">Leaderboards</h1>
            <p className="text-xs text-white/30 mt-0.5">Top holders ranked by hold duration and balance weight</p>
          </div>
          {latest && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-white/25 font-black uppercase tracking-widest">Epoch</span>
              <span className="font-mono text-sm font-black text-white">#{latest.epochNumber}</span>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${
                latest.status === "claim_open"
                  ? "bg-[#B6F04A]/10 text-[#B6F04A] border-[#B6F04A]/20"
                  : "bg-white/[0.04] text-white/30 border-white/[0.06]"
              }`}>
                {latest.status}
              </span>
            </div>
          )}
        </div>

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

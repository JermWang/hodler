import { Users, TrendingUp, Coins, Clock, Trophy, ChevronRight, Flame, Sparkles, Timer } from "lucide-react";
import Link from "next/link";

import {
  getHodlrBoardStats,
  getHodlrEpochStats,
  getHodlrTopEarners,
  listHodlrEpochs,
  listHodlrRankings,
} from "@/app/lib/hodlr/store";
import { HodlrLayout } from "@/app/components/hodlr";
import BoardClient from "./client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function lamportsToSol(lamports: string): string {
  try {
    const val = BigInt(lamports || "0");
    const sol = Number(val) / 1e9;
    if (sol >= 1000) return sol.toLocaleString(undefined, { maximumFractionDigits: 0 });
    return sol.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } catch {
    return "0";
  }
}

function shortPk(pk: string): string {
  const s = String(pk ?? "").trim();
  if (s.length <= 10) return s;
  return `${s.slice(0, 4)}...${s.slice(-4)}`;
}

function statusLabel(status: string): { text: string; variant: "success" | "warning" | "muted" } {
  switch (status) {
    case "claim_open":
      return { text: "Claim Open", variant: "success" };
    case "claim_closed":
      return { text: "Claim Closed", variant: "muted" };
    case "distribution_dry_run":
      return { text: "Distribution Ready", variant: "warning" };
    case "ranking_computed":
      return { text: "Ranked", variant: "warning" };
    case "finalized":
      return { text: "Finalized", variant: "warning" };
    case "active":
      return { text: "Active", variant: "success" };
    default:
      return { text: status || "Unknown", variant: "muted" };
  }
}

export default async function BoardPage() {
  let stats: Awaited<ReturnType<typeof getHodlrBoardStats>> = {
    totalEpochs: 0,
    totalDistributedLamports: "0",
    totalClaimants: 0,
    latestEpoch: null,
  };
  let recentEpochs: any[] = [];
  let topEarners: any[] = [];
  let epochStats: Awaited<ReturnType<typeof getHodlrEpochStats>> = null;
  let topHolders: Awaited<ReturnType<typeof listHodlrRankings>> = [];

  try {
    const [s, epochs, earners] = await Promise.all([
      getHodlrBoardStats(),
      listHodlrEpochs({ limit: 6 }),
      getHodlrTopEarners(5),
    ]);
    stats = s;
    recentEpochs = epochs as any[];
    topEarners = earners as any[];

    const latestEpoch = s.latestEpoch;
    epochStats = latestEpoch ? await getHodlrEpochStats(latestEpoch.id) : null;
    topHolders = latestEpoch ? await listHodlrRankings(latestEpoch.id) : [];
  } catch (e) {
    console.error("Failed to load HODLR board stats", e);
  }

  const latestEpoch = stats.latestEpoch;

  const claimRate = epochStats && epochStats.eligibleCount > 0
    ? Math.round((epochStats.claimedCount / epochStats.eligibleCount) * 100)
    : 0;

  return (
    <HodlrLayout>
      <div className="px-4 md:px-6 pt-6 pb-12">
        {/* Filter Tabs Row - pump.fun style */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-emerald-500 text-black">
              <Flame className="h-4 w-4" />
              Top Holders
            </button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium text-[#9AA3B2] hover:bg-white/[0.04]">
              <Sparkles className="h-4 w-4" />
              New
            </button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium text-[#9AA3B2] hover:bg-white/[0.04]">
              <Coins className="h-4 w-4" />
              Biggest Payouts
            </button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium text-[#9AA3B2] hover:bg-white/[0.04]">
              <Timer className="h-4 w-4" />
              Longest Held
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#9AA3B2]">Filter</span>
            <div className="flex gap-1">
              <button className="p-1.5 rounded bg-white/[0.06] text-white">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 16 16"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>
              </button>
              <button className="p-1.5 rounded text-[#9AA3B2] hover:bg-white/[0.04]">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 16 16"><rect x="1" y="1" width="14" height="3" rx="1"/><rect x="1" y="6" width="14" height="3" rx="1"/><rect x="1" y="11" width="14" height="3" rx="1"/></svg>
              </button>
            </div>
          </div>
        </div>
        {/* Top Strip */}
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 mb-6 rounded-lg border border-white/[0.06] bg-white/[0.02]">
          {latestEpoch ? (
            <>
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#9AA3B2]">Epoch</span>
                <span className="font-mono text-sm font-semibold text-white">#{latestEpoch.epochNumber}</span>
              </div>
              <div className="w-px h-4 bg-white/10" />
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#9AA3B2]">Status</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded border ${
                  statusLabel(latestEpoch.status).variant === "success"
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    : statusLabel(latestEpoch.status).variant === "warning"
                    ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                    : "bg-white/[0.03] text-[#9AA3B2] border-white/5"
                }`}>
                  {statusLabel(latestEpoch.status).text}
                </span>
              </div>
              <div className="w-px h-4 bg-white/10" />
              <BoardClient targetUnix={latestEpoch.endAtUnix} />
              <div className="w-px h-4 bg-white/10 hidden sm:block" />
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#9AA3B2]">Pool</span>
                <span className="font-mono text-sm font-semibold text-white">{lamportsToSol(epochStats?.totalPoolLamports || "0")} SOL</span>
              </div>
            </>
          ) : (
            <span className="text-sm text-[#9AA3B2]">No epochs yet</span>
          )}
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Main Content */}
          <div className="flex-1 min-w-0">
            {/* Hero Tiles */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
              <div className="flex flex-col gap-2 p-4 rounded-lg border border-white/[0.06] bg-white/[0.02]">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-[#9AA3B2] uppercase tracking-wider">Total Distributed</span>
                  <Coins className="h-4 w-4 text-[#9AA3B2]" />
                </div>
                <span className="text-2xl font-bold font-mono text-white">{lamportsToSol(stats.totalDistributedLamports)} SOL</span>
                <span className="text-xs text-[#9AA3B2]">All time</span>
              </div>

              <div className="flex flex-col gap-2 p-4 rounded-lg border border-white/[0.06] bg-white/[0.02]">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-[#9AA3B2] uppercase tracking-wider">Total Claimants</span>
                  <Users className="h-4 w-4 text-[#9AA3B2]" />
                </div>
                <span className="text-2xl font-bold font-mono text-white">{stats.totalClaimants}</span>
                <span className="text-xs text-[#9AA3B2]">Unique wallets</span>
              </div>

              <div className="flex flex-col gap-2 p-4 rounded-lg border border-white/[0.06] bg-white/[0.02]">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-[#9AA3B2] uppercase tracking-wider">Epochs</span>
                  <Clock className="h-4 w-4 text-[#9AA3B2]" />
                </div>
                <span className="text-2xl font-bold font-mono text-white">{stats.totalEpochs}</span>
                <span className="text-xs text-[#9AA3B2]">Completed</span>
              </div>
            </div>

            {/* Top 50 Longest Holders */}
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] mb-6">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-amber-400" />
                  <span className="text-sm font-semibold text-white">Top Holders</span>
                </div>
                <Link href="/leaderboards" className="flex items-center gap-1 text-xs text-[#9AA3B2] hover:text-white transition-colors">
                  View all <ChevronRight className="h-3 w-3" />
                </Link>
              </div>
              <div className="flex flex-col divide-y divide-white/[0.06]">
                <div className="flex items-center gap-4 px-4 py-2 text-xs font-medium text-[#9AA3B2] uppercase tracking-wider bg-white/[0.02]">
                  <div style={{ width: "40px" }}>Rank</div>
                  <div className="flex-1">Wallet</div>
                  <div style={{ width: "80px" }} className="text-right">Days</div>
                  <div style={{ width: "80px" }} className="text-right">Share</div>
                </div>
                {topHolders.slice(0, 10).map((h) => (
                  <div key={h.walletPubkey} className="flex items-center gap-4 px-4 py-2.5 hover:bg-white/[0.03] transition-colors">
                    <div style={{ width: "40px" }} className="flex items-center">
                      <span className={`flex h-6 w-6 items-center justify-center rounded text-xs font-bold ${
                        h.rank === 1 ? "bg-gradient-to-br from-yellow-400 to-yellow-600 text-black" :
                        h.rank === 2 ? "bg-gradient-to-br from-gray-300 to-gray-500 text-black" :
                        h.rank === 3 ? "bg-gradient-to-br from-amber-600 to-amber-800 text-white" :
                        "bg-white/[0.06] text-[#9AA3B2]"
                      }`}>
                        {h.rank}
                      </span>
                    </div>
                    <div className="flex-1 font-mono text-sm text-white truncate">{shortPk(h.walletPubkey)}</div>
                    <div style={{ width: "80px" }} className="text-right font-mono text-sm text-white">{h.holdingDays.toFixed(1)}</div>
                    <div style={{ width: "80px" }} className="text-right font-mono text-sm text-emerald-400">{(h.shareBps / 100).toFixed(1)}%</div>
                  </div>
                ))}
                {topHolders.length === 0 && (
                  <div className="px-4 py-6 text-sm text-[#9AA3B2] text-center">No rankings yet</div>
                )}
              </div>
            </div>

            {/* Recent Distributions */}
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02]">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-emerald-400" />
                  <span className="text-sm font-semibold text-white">Recent Epochs</span>
                </div>
                <Link href="/distributions" className="flex items-center gap-1 text-xs text-[#9AA3B2] hover:text-white transition-colors">
                  View all <ChevronRight className="h-3 w-3" />
                </Link>
              </div>
              <div className="flex flex-col divide-y divide-white/[0.06]">
                {recentEpochs.map((e) => (
                  <div key={e.id} className="flex items-center gap-4 px-4 py-3 hover:bg-white/[0.03] transition-colors">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-white">#{e.epochNumber}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded border ${
                        statusLabel(e.status).variant === "success"
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          : statusLabel(e.status).variant === "warning"
                          ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                          : "bg-white/[0.03] text-[#9AA3B2] border-white/5"
                      }`}>
                        {statusLabel(e.status).text}
                      </span>
                    </div>
                    <div className="flex-1" />
                    <div className="text-xs text-[#9AA3B2]">
                      {e.endAtUnix ? new Date(e.endAtUnix * 1000).toLocaleDateString() : "-"}
                    </div>
                  </div>
                ))}
                {recentEpochs.length === 0 && (
                  <div className="px-4 py-6 text-sm text-[#9AA3B2] text-center">No epochs yet</div>
                )}
              </div>
            </div>
          </div>

          {/* Right Rail */}
          <div className="w-full lg:w-[320px] flex-shrink-0 space-y-4">
            {/* Your Wallet Card */}
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
              <div className="flex items-center gap-2 text-xs font-medium text-[#9AA3B2] uppercase tracking-wider mb-4">
                <Users className="h-3.5 w-3.5" />
                Your Wallet
              </div>
              <p className="text-sm text-[#9AA3B2] mb-3">Connect your wallet to check eligibility and claim rewards.</p>
              <Link
                href="/claims"
                className="block w-full py-2.5 rounded-lg text-sm font-semibold text-center bg-emerald-500 text-black hover:bg-emerald-400 transition-colors"
              >
                Go to Claims
              </Link>
            </div>

            {/* Live Stats */}
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
              <div className="text-xs font-medium text-[#9AA3B2] uppercase tracking-wider mb-3">Current Epoch Stats</div>
              {epochStats ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#9AA3B2]">Eligible</span>
                    <span className="font-mono text-sm text-white">{epochStats.eligibleCount}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#9AA3B2]">Claimed</span>
                    <span className="font-mono text-sm text-white">{epochStats.claimedCount}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#9AA3B2]">Claim Rate</span>
                    <span className="font-mono text-sm text-emerald-400">{claimRate}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${claimRate}%` }} />
                  </div>
                </div>
              ) : (
                <div className="text-sm text-[#9AA3B2]">No data</div>
              )}
            </div>

            {/* Top Earners */}
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
              <div className="text-xs font-medium text-[#9AA3B2] uppercase tracking-wider mb-3">Top Earners (All Time)</div>
              <div className="space-y-2">
                {topEarners.map((e, i) => (
                  <div key={e.walletPubkey} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[#9AA3B2]">{i + 1}.</span>
                      <span className="font-mono text-xs text-white">{shortPk(e.walletPubkey)}</span>
                    </div>
                    <span className="font-mono text-xs text-emerald-400">{lamportsToSol(e.totalLamports)}</span>
                  </div>
                ))}
                {topEarners.length === 0 && (
                  <div className="text-xs text-[#9AA3B2]">No data yet</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </HodlrLayout>
  );
}

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

  const sb = (v: "success"|"warning"|"muted", t: string) => (
    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${
      v==="success" ? "bg-[#B6F04A]/10 text-[#B6F04A] border-[#B6F04A]/20" :
      v==="warning" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
      "bg-white/[0.04] text-white/30 border-white/[0.06]"}`}>{t}</span>
  );

  return (
    <HodlrLayout>
      <div className="px-5 md:px-7 pt-7 pb-14">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-black text-white tracking-tight">Board</h1>
            <p className="text-xs text-white/30 mt-0.5">Live holder rankings and epoch stats</p>
          </div>
          <div className="flex items-center gap-1.5">
            {(["Top Holders","Biggest Payouts","Longest Held"] as const).map((label,i)=>(
              <button key={label} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                i===0?"bg-[#B6F04A] text-black":"text-white/30 hover:text-white/60 hover:bg-white/[0.04]"}`}>
                {i===0?<Flame className="h-3 w-3"/>:i===1?<Coins className="h-3 w-3"/>:<Timer className="h-3 w-3"/>}
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
        </div>
        {/* Epoch status strip */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 mb-7 rounded-xl border border-white/[0.06] bg-white/[0.015]">
          {latestEpoch ? (
            <>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-white/25 font-black uppercase tracking-widest">Epoch</span>
                <span className="font-mono text-sm font-black text-white">#{latestEpoch.epochNumber}</span>
              </div>
              <div className="w-px h-4 bg-white/[0.08]" />
              {sb(statusLabel(latestEpoch.status).variant, statusLabel(latestEpoch.status).text)}
              <div className="w-px h-4 bg-white/[0.08]" />
              <BoardClient targetUnix={latestEpoch.endAtUnix} />
              <div className="w-px h-4 bg-white/[0.08] hidden sm:block" />
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-white/25 font-black uppercase tracking-widest">Pool</span>
                <span className="font-mono text-sm font-black text-[#B6F04A]">{lamportsToSol(epochStats?.totalPoolLamports || "0")} SOL</span>
              </div>
            </>
          ) : (
            <span className="text-sm text-white/30">No epochs yet</span>
          )}
        </div>

        {/* Stat tiles */}
        <div className="grid grid-cols-3 gap-3 mb-7">
          {([
            { label: "Total Distributed", value: `${lamportsToSol(stats.totalDistributedLamports)} SOL`, sub: "All time", icon: <Coins className="h-4 w-4" />, accent: true },
            { label: "Claimants", value: stats.totalClaimants, sub: "Unique wallets", icon: <Users className="h-4 w-4" />, accent: false },
            { label: "Epochs", value: stats.totalEpochs, sub: "Completed", icon: <Clock className="h-4 w-4" />, accent: false },
          ]).map((tile) => (
            <div key={tile.label} className={`flex flex-col gap-2 p-4 rounded-xl border ${
              tile.accent ? "border-[#B6F04A]/20 bg-[#B6F04A]/[0.04]" : "border-white/[0.06] bg-white/[0.015]"
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black text-white/25 uppercase tracking-widest">{tile.label}</span>
                <span className={tile.accent ? "text-[#B6F04A]/30" : "text-white/15"}>{tile.icon}</span>
              </div>
              <span className={`text-2xl font-black font-mono tabular-nums ${
                tile.accent ? "text-[#B6F04A]" : "text-white"
              }`}>{tile.value}</span>
              <span className="text-[11px] text-white/25">{tile.sub}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-col lg:flex-row gap-5">
          <div className="flex-1 min-w-0 space-y-5">

            {/* Top Holders */}
            <div className="rounded-xl border border-white/[0.06] bg-[#0b0c0e] overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.05]">
                <div className="flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-amber-400" />
                  <span className="text-sm font-black text-white">Top Holders</span>
                </div>
                <Link href="/leaderboards" className="flex items-center gap-1 text-[11px] font-bold text-white/25 hover:text-[#B6F04A] transition-colors uppercase tracking-wider">
                  View all <ChevronRight className="h-3 w-3" />
                </Link>
              </div>
              <div className="flex items-center gap-4 px-5 py-2 text-[10px] font-black text-white/20 uppercase tracking-widest bg-white/[0.01] border-b border-white/[0.04]">
                <div style={{width:36}}>#</div>
                <div className="flex-1">Wallet</div>
                <div style={{width:72}} className="text-right">Days</div>
                <div style={{width:72}} className="text-right">Share</div>
              </div>
              <div className="divide-y divide-white/[0.04]">
                {topHolders.slice(0, 10).map((h) => (
                  <div key={h.walletPubkey} className="flex items-center gap-4 px-5 py-3 hover:bg-white/[0.02] transition-colors">
                    <div style={{width:36}}>
                      <span className={`inline-flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-black ${
                        h.rank===1?"bg-gradient-to-br from-yellow-300 to-yellow-500 text-black":
                        h.rank===2?"bg-gradient-to-br from-slate-300 to-slate-500 text-black":
                        h.rank===3?"bg-gradient-to-br from-amber-600 to-amber-800 text-white":
                        "bg-white/[0.06] text-white/30"}`}>{h.rank}</span>
                    </div>
                    <div className="flex-1 font-mono text-sm text-white/60 truncate">{shortPk(h.walletPubkey)}</div>
                    <div style={{width:72}} className="text-right font-mono text-sm text-white/50 tabular-nums">{h.holdingDays.toFixed(1)}</div>
                    <div style={{width:72}} className="text-right font-mono text-sm font-bold text-[#B6F04A] tabular-nums">{(h.shareBps/100).toFixed(1)}%</div>
                  </div>
                ))}
                {topHolders.length===0 && <div className="px-5 py-8 text-sm text-white/25 text-center">No rankings yet</div>}
              </div>
            </div>

            {/* Recent Epochs */}
            <div className="rounded-xl border border-white/[0.06] bg-[#0b0c0e] overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.05]">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-[#B6F04A]" />
                  <span className="text-sm font-black text-white">Recent Epochs</span>
                </div>
                <Link href="/distributions" className="flex items-center gap-1 text-[11px] font-bold text-white/25 hover:text-[#B6F04A] transition-colors uppercase tracking-wider">
                  View all <ChevronRight className="h-3 w-3" />
                </Link>
              </div>
              <div className="divide-y divide-white/[0.04]">
                {recentEpochs.map((e) => (
                  <div key={e.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-white/[0.02] transition-colors">
                    <span className="font-mono text-sm font-black text-white">#{e.epochNumber}</span>
                    {sb(statusLabel(e.status).variant, statusLabel(e.status).text)}
                    <div className="flex-1" />
                    <span className="text-xs text-white/25 font-mono tabular-nums">
                      {e.endAtUnix ? new Date(e.endAtUnix*1000).toLocaleDateString() : "-"}
                    </span>
                  </div>
                ))}
                {recentEpochs.length===0 && <div className="px-5 py-8 text-sm text-white/25 text-center">No epochs yet</div>}
              </div>
            </div>
          </div>

          {/* Right Rail */}
          <div className="w-full lg:w-[290px] flex-shrink-0 space-y-4">

            <div className="rounded-xl border border-[#B6F04A]/20 bg-[#B6F04A]/[0.04] p-5">
              <div className="flex items-center gap-2 text-[10px] font-black text-[#B6F04A]/40 uppercase tracking-widest mb-3">
                <Users className="h-3.5 w-3.5" /> Your Wallet
              </div>
              <p className="text-sm text-white/35 mb-4 leading-relaxed">Connect your wallet to check eligibility and claim rewards.</p>
              <Link href="/claims" className="block w-full py-2.5 rounded-xl text-sm font-black text-center bg-[#B6F04A] text-black hover:bg-[#c8f560] transition-colors">
                Go to Claims
              </Link>
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-[#0b0c0e] p-5">
              <div className="text-[10px] font-black text-white/25 uppercase tracking-widest mb-4">Epoch Stats</div>
              {epochStats ? (
                <div className="space-y-3">
                  {[
                    { label: "Eligible", value: epochStats.eligibleCount, accent: false },
                    { label: "Claimed", value: epochStats.claimedCount, accent: false },
                    { label: "Claim Rate", value: `${claimRate}%`, accent: true },
                  ].map(row => (
                    <div key={row.label} className="flex items-center justify-between">
                      <span className="text-xs text-white/30">{row.label}</span>
                      <span className={`font-mono text-sm font-bold ${
                        row.accent ? "text-[#B6F04A]" : "text-white/70"
                      }`}>{row.value}</span>
                    </div>
                  ))}
                  <div className="w-full h-1 bg-white/[0.06] rounded-full overflow-hidden mt-1">
                    <div className="h-full bg-[#B6F04A] rounded-full transition-all" style={{width:`${claimRate}%`}} />
                  </div>
                </div>
              ) : (
                <div className="text-sm text-white/25">No data</div>
              )}
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-[#0b0c0e] p-5">
              <div className="text-[10px] font-black text-white/25 uppercase tracking-widest mb-4">Top Earners</div>
              <div className="space-y-2.5">
                {topEarners.map((e, i) => (
                  <div key={e.walletPubkey} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-white/25 w-4 font-mono">{i+1}</span>
                      <span className="font-mono text-xs text-white/60">{shortPk(e.walletPubkey)}</span>
                    </div>
                    <span className="font-mono text-xs font-bold text-[#B6F04A]">{lamportsToSol(e.totalLamports)}</span>
                  </div>
                ))}
                {topEarners.length===0 && <div className="text-xs text-white/25">No data yet</div>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </HodlrLayout>
  );
}

"use client";

import { useState } from "react";
import { Clock, Coins, TrendingUp, ChevronDown, ChevronUp } from "lucide-react";

interface RankingRow {
  walletPubkey: string;
  rank: number;
  holdingDays: number;
  balanceRaw: string;
  shareBps: number;
  weight: number;
}

interface EarnerRow {
  walletPubkey: string;
  totalLamports: string;
}

interface EpochRow {
  id: string;
  epochNumber: number;
  status: string;
}

interface LeaderboardsClientProps {
  rankings: RankingRow[];
  topEarners: EarnerRow[];
  recentEpochs: EpochRow[];
  latestEpochNumber: number;
}

type TabKey = "holders" | "earners";

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

export default function LeaderboardsClient({
  rankings,
  topEarners,
  recentEpochs,
  latestEpochNumber,
}: LeaderboardsClientProps) {
  const [tab, setTab] = useState<TabKey>("holders");
  const [expandedWallet, setExpandedWallet] = useState<string | null>(null);

  const toggleExpand = (wallet: string) => {
    setExpandedWallet((prev) => (prev === wallet ? null : wallet));
  };

  const rankBadge = (rank: number) => (
    <span className={`inline-flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-black flex-shrink-0 ${
      rank===1?"bg-gradient-to-br from-yellow-300 to-yellow-500 text-black":
      rank===2?"bg-gradient-to-br from-slate-300 to-slate-500 text-black":
      rank===3?"bg-gradient-to-br from-amber-600 to-amber-800 text-white":
      "bg-white/[0.06] text-white/30"}`}>{rank}</span>
  );

  return (
    <div>
      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 mb-5 rounded-xl bg-white/[0.02] border border-white/[0.05] w-fit">
        {(["holders","earners"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              tab===t ? "bg-[#B6F04A] text-black" : "text-white/35 hover:text-white/70"
            }`}
          >
            {t==="holders" ? <Clock className="h-3.5 w-3.5" /> : <Coins className="h-3.5 w-3.5" />}
            {t==="holders" ? "Top Holders" : "Top Earners"}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-white/[0.06] bg-[#0b0c0e] overflow-hidden">
        {tab === "holders" && (
          <>
            <div className="px-5 py-3.5 border-b border-white/[0.05] flex items-center justify-between">
              <div>
                <div className="text-sm font-black text-white">Top 50 Longest Holders</div>
                <div className="text-[11px] text-white/30 mt-0.5">Epoch #{latestEpochNumber} - ranked by hold duration, then balance</div>
              </div>
              <span className="text-[11px] font-bold text-white/25 font-mono">{rankings.length} holders</span>
            </div>
            <div className="flex items-center gap-4 px-5 py-2 text-[10px] font-black text-white/20 uppercase tracking-widest bg-white/[0.01] border-b border-white/[0.04]">
              <div style={{width:42}}>#</div>
              <div className="flex-1">Wallet</div>
              <div style={{width:90}} className="text-right">Days</div>
              <div style={{width:90}} className="text-right">Balance</div>
              <div style={{width:72}} className="text-right">Share</div>
              <div style={{width:28}} />
            </div>
            <div className="divide-y divide-white/[0.04]">
              {rankings.map((r) => (
                <div key={r.walletPubkey}>
                  <div
                    className="flex items-center gap-4 px-5 py-3 hover:bg-white/[0.02] transition-colors cursor-pointer"
                    onClick={() => toggleExpand(r.walletPubkey)}
                  >
                    <div style={{width:42}}>{rankBadge(r.rank)}</div>
                    <div className="flex-1 font-mono text-sm text-white/60 truncate">{shortPk(r.walletPubkey)}</div>
                    <div style={{width:90}} className="text-right font-mono text-sm text-white/50 tabular-nums">{r.holdingDays.toFixed(1)}</div>
                    <div style={{width:90}} className="text-right font-mono text-sm text-white/50 tabular-nums">{formatBalance(r.balanceRaw)}</div>
                    <div style={{width:72}} className="text-right font-mono text-sm font-bold text-[#B6F04A] tabular-nums">{(r.shareBps/100).toFixed(2)}%</div>
                    <div style={{width:28}} className="flex justify-center text-white/20">
                      {expandedWallet===r.walletPubkey ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </div>
                  </div>
                  {expandedWallet===r.walletPubkey && (
                    <div className="px-5 py-4 bg-white/[0.01] border-t border-white/[0.04]">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs mb-3">
                        {[
                          {label:"Full Wallet", value:r.walletPubkey, mono:true, break:true},
                          {label:"Weight Score", value:r.weight.toFixed(6), mono:true},
                          {label:"Raw Balance", value:r.balanceRaw, mono:true},
                          {label:"Share (bps)", value:String(r.shareBps), mono:true},
                        ].map(f=>(
                          <div key={f.label}>
                            <div className="text-white/25 mb-1">{f.label}</div>
                            <div className={`text-white/70 ${f.mono?"font-mono":""} ${f.break?"break-all":""}`}>{f.value}</div>
                          </div>
                        ))}
                      </div>
                      <a href={`https://solscan.io/account/${r.walletPubkey}`} target="_blank" rel="noopener noreferrer"
                        className="text-[11px] font-bold text-[#B6F04A]/70 hover:text-[#B6F04A] transition-colors">
                        View on Solscan
                      </a>
                    </div>
                  )}
                </div>
              ))}
              {rankings.length===0 && <div className="px-5 py-8 text-sm text-white/25 text-center">No rankings yet</div>}
            </div>
          </>
        )}

        {tab === "earners" && (
          <>
            <div className="px-5 py-3.5 border-b border-white/[0.05] flex items-center justify-between">
              <div>
                <div className="text-sm font-black text-white">Top Earners</div>
                <div className="text-[11px] text-white/30 mt-0.5">Cumulative claimed rewards across all epochs</div>
              </div>
              <span className="text-[11px] font-bold text-white/25 font-mono">{topEarners.length} earners</span>
            </div>
            <div className="flex items-center gap-4 px-5 py-2 text-[10px] font-black text-white/20 uppercase tracking-widest bg-white/[0.01] border-b border-white/[0.04]">
              <div style={{width:42}}>#</div>
              <div className="flex-1">Wallet</div>
              <div style={{width:130}} className="text-right">Total Earned</div>
            </div>
            <div className="divide-y divide-white/[0.04]">
              {topEarners.map((e, i) => (
                <div key={e.walletPubkey} className="flex items-center gap-4 px-5 py-3 hover:bg-white/[0.02] transition-colors">
                  <div style={{width:42}}>{rankBadge(i+1)}</div>
                  <div className="flex-1 font-mono text-sm text-white/60 truncate">{shortPk(e.walletPubkey)}</div>
                  <div style={{width:130}} className="text-right font-mono text-sm font-bold text-[#B6F04A] tabular-nums">{lamportsToSol(e.totalLamports)} SOL</div>
                </div>
              ))}
              {topEarners.length===0 && <div className="px-5 py-8 text-sm text-white/25 text-center">No earners yet</div>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

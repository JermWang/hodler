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

  return (
    <div>
      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 mb-4 rounded-lg bg-white/[0.02] border border-white/[0.06] w-fit">
        <button
          type="button"
          onClick={() => setTab("holders")}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === "holders"
              ? "bg-emerald-500 text-black"
              : "text-[#9AA3B2] hover:text-white"
          }`}
        >
          <Clock className="h-4 w-4" />
          Top Holders
        </button>
        <button
          type="button"
          onClick={() => setTab("earners")}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === "earners"
              ? "bg-emerald-500 text-black"
              : "text-[#9AA3B2] hover:text-white"
          }`}
        >
          <Coins className="h-4 w-4" />
          Top Earners
        </button>
      </div>

      {/* Content */}
      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] overflow-hidden">
        {tab === "holders" && (
          <>
            <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-white">Top 50 Longest Holders</div>
                <div className="text-xs text-[#9AA3B2]">Epoch #{latestEpochNumber} - Ranked by holding duration, then balance</div>
              </div>
              <div className="text-xs text-[#9AA3B2]">{rankings.length} holders</div>
            </div>

            {/* Header */}
            <div className="flex items-center gap-4 px-4 py-2 text-xs font-medium text-[#9AA3B2] uppercase tracking-wider bg-white/[0.02] border-b border-white/[0.06]">
              <div style={{ width: "50px" }}>Rank</div>
              <div className="flex-1">Wallet</div>
              <div style={{ width: "100px" }} className="text-right">Days Held</div>
              <div style={{ width: "100px" }} className="text-right">Balance</div>
              <div style={{ width: "80px" }} className="text-right">Share</div>
              <div style={{ width: "30px" }}></div>
            </div>

            {/* Rows */}
            <div className="flex flex-col divide-y divide-white/[0.06]">
              {rankings.map((r) => (
                <div key={r.walletPubkey}>
                  <div
                    className="flex items-center gap-4 px-4 py-2.5 hover:bg-white/[0.03] transition-colors cursor-pointer"
                    onClick={() => toggleExpand(r.walletPubkey)}
                  >
                    <div style={{ width: "50px" }} className="flex items-center">
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded text-xs font-bold ${
                          r.rank === 1
                            ? "bg-gradient-to-br from-yellow-400 to-yellow-600 text-black"
                            : r.rank === 2
                            ? "bg-gradient-to-br from-gray-300 to-gray-500 text-black"
                            : r.rank === 3
                            ? "bg-gradient-to-br from-amber-600 to-amber-800 text-white"
                            : "bg-white/[0.06] text-[#9AA3B2]"
                        }`}
                      >
                        {r.rank}
                      </span>
                    </div>
                    <div className="flex-1 font-mono text-sm text-white truncate">{shortPk(r.walletPubkey)}</div>
                    <div style={{ width: "100px" }} className="text-right font-mono text-sm text-white">
                      {r.holdingDays.toFixed(1)}
                    </div>
                    <div style={{ width: "100px" }} className="text-right font-mono text-sm text-white">
                      {formatBalance(r.balanceRaw)}
                    </div>
                    <div style={{ width: "80px" }} className="text-right font-mono text-sm text-emerald-400">
                      {(r.shareBps / 100).toFixed(2)}%
                    </div>
                    <div style={{ width: "30px" }} className="flex justify-center text-[#9AA3B2]">
                      {expandedWallet === r.walletPubkey ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {expandedWallet === r.walletPubkey && (
                    <div className="px-4 py-3 bg-white/[0.01] border-t border-white/[0.04]">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                        <div>
                          <div className="text-[#9AA3B2] mb-1">Full Wallet</div>
                          <div className="font-mono text-white break-all">{r.walletPubkey}</div>
                        </div>
                        <div>
                          <div className="text-[#9AA3B2] mb-1">Weight Score</div>
                          <div className="font-mono text-white">{r.weight.toFixed(6)}</div>
                        </div>
                        <div>
                          <div className="text-[#9AA3B2] mb-1">Raw Balance</div>
                          <div className="font-mono text-white">{r.balanceRaw}</div>
                        </div>
                        <div>
                          <div className="text-[#9AA3B2] mb-1">Share (bps)</div>
                          <div className="font-mono text-white">{r.shareBps}</div>
                        </div>
                      </div>
                      <div className="mt-3">
                        <a
                          href={`https://solscan.io/account/${r.walletPubkey}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-emerald-400 hover:underline"
                        >
                          View on Solscan
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {rankings.length === 0 && (
                <div className="px-4 py-8 text-sm text-[#9AA3B2] text-center">No rankings yet</div>
              )}
            </div>
          </>
        )}

        {tab === "earners" && (
          <>
            <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-white">Top Earners (All Time)</div>
                <div className="text-xs text-[#9AA3B2]">Cumulative claimed rewards across all epochs</div>
              </div>
              <div className="text-xs text-[#9AA3B2]">{topEarners.length} earners</div>
            </div>

            {/* Header */}
            <div className="flex items-center gap-4 px-4 py-2 text-xs font-medium text-[#9AA3B2] uppercase tracking-wider bg-white/[0.02] border-b border-white/[0.06]">
              <div style={{ width: "50px" }}>Rank</div>
              <div className="flex-1">Wallet</div>
              <div style={{ width: "120px" }} className="text-right">Total Earned</div>
            </div>

            {/* Rows */}
            <div className="flex flex-col divide-y divide-white/[0.06]">
              {topEarners.map((e, i) => (
                <div
                  key={e.walletPubkey}
                  className="flex items-center gap-4 px-4 py-2.5 hover:bg-white/[0.03] transition-colors"
                >
                  <div style={{ width: "50px" }} className="flex items-center">
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded text-xs font-bold ${
                        i === 0
                          ? "bg-gradient-to-br from-yellow-400 to-yellow-600 text-black"
                          : i === 1
                          ? "bg-gradient-to-br from-gray-300 to-gray-500 text-black"
                          : i === 2
                          ? "bg-gradient-to-br from-amber-600 to-amber-800 text-white"
                          : "bg-white/[0.06] text-[#9AA3B2]"
                      }`}
                    >
                      {i + 1}
                    </span>
                  </div>
                  <div className="flex-1 font-mono text-sm text-white truncate">{shortPk(e.walletPubkey)}</div>
                  <div style={{ width: "120px" }} className="text-right font-mono text-sm text-emerald-400">
                    {lamportsToSol(e.totalLamports)} SOL
                  </div>
                </div>
              ))}

              {topEarners.length === 0 && (
                <div className="px-4 py-8 text-sm text-[#9AA3B2] text-center">No earners yet</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

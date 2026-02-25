import { Coins, Calendar, Users, ChevronRight } from "lucide-react";
import Link from "next/link";

import { HodlrLayout } from "@/app/components/hodlr";
import {
  getLatestHodlrEpoch,
  getHodlrEpochStats,
  listHodlrDistributions,
  listHodlrEpochs,
} from "@/app/lib/hodlr/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function shortPk(pk: string): string {
  const s = String(pk ?? "").trim();
  if (s.length <= 10) return s;
  return `${s.slice(0, 4)}...${s.slice(-4)}`;
}

function lamportsToSol(lamports: string | bigint): string {
  try {
    const val = typeof lamports === "bigint" ? lamports : BigInt(String(lamports || "0"));
    const sol = Number(val) / 1e9;
    if (sol >= 1000) return sol.toLocaleString(undefined, { maximumFractionDigits: 0 });
    return sol.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  } catch {
    return "0";
  }
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
    default:
      return { text: status || "Unknown", variant: "muted" };
  }
}

export default async function DistributionsPage() {
  let latest: Awaited<ReturnType<typeof getLatestHodlrEpoch>> = null;
  let recentEpochs: Awaited<ReturnType<typeof listHodlrEpochs>> = [];
  let distributions: Awaited<ReturnType<typeof listHodlrDistributions>> = [];
  let epochStats: Awaited<ReturnType<typeof getHodlrEpochStats>> = null;

  try {
    const res = await Promise.all([
      getLatestHodlrEpoch(),
      listHodlrEpochs({ limit: 10 }),
    ]);
    latest = res[0];
    recentEpochs = res[1];

    const epochId = latest?.id ?? "";
    const more = await Promise.all([
      epochId ? listHodlrDistributions(epochId) : [],
      epochId ? getHodlrEpochStats(epochId) : null,
    ]);
    distributions = more[0];
    epochStats = more[1];
  } catch (e) {
    console.error("Failed to load HODLR distributions", e);
  }

  const epochId = latest?.id ?? "";

  const totalLamports = distributions.reduce((sum, r) => sum + BigInt(String(r.amountLamports ?? "0")), 0n);

  const claimRate = epochStats && epochStats.eligibleCount > 0
    ? Math.round((epochStats.claimedCount / epochStats.eligibleCount) * 100) : 0;

  const sb = (v: "success"|"warning"|"muted", t: string) => (
    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${
      v==="success"?"bg-[#B6F04A]/10 text-[#B6F04A] border-[#B6F04A]/20":
      v==="warning"?"bg-amber-500/10 text-amber-400 border-amber-500/20":
      "bg-white/[0.04] text-white/30 border-white/[0.06]"}`}>{t}</span>
  );

  return (
    <HodlrLayout>
      <div className="px-5 md:px-7 pt-7 pb-14">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-7">
          <div>
            <h1 className="text-xl font-black text-white tracking-tight">Distributions</h1>
            <p className="text-xs text-white/30 mt-0.5">Per-wallet reward allocations and epoch history</p>
          </div>
          {latest && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-white/25 font-black uppercase tracking-widest">Viewing Epoch</span>
              <span className="font-mono text-sm font-black text-white">#{latest.epochNumber}</span>
            </div>
          )}
        </div>

        <div className="flex flex-col lg:flex-row gap-5">
          <div className="flex-1 min-w-0">
            {/* Stats bar */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              {[
                { label: "Total Pool", value: `${lamportsToSol(totalLamports)} SOL`, accent: true },
                { label: "Recipients", value: distributions.length, accent: false },
                { label: "Claimed", value: epochStats?.claimedCount ?? 0, accent: false },
                { label: "Claim Rate", value: `${claimRate}%`, accent: true },
              ].map(tile => (
                <div key={tile.label} className={`flex flex-col gap-1.5 p-4 rounded-xl border ${
                  tile.accent ? "border-[#B6F04A]/20 bg-[#B6F04A]/[0.04]" : "border-white/[0.06] bg-white/[0.015]"
                }`}>
                  <span className="text-[10px] font-black text-white/25 uppercase tracking-widest">{tile.label}</span>
                  <span className={`font-mono text-xl font-black tabular-nums ${
                    tile.accent ? "text-[#B6F04A]" : "text-white"
                  }`}>{tile.value}</span>
                </div>
              ))}
            </div>

            {/* Allocations table */}
            <div className="rounded-xl border border-white/[0.06] bg-[#0b0c0e] overflow-hidden">
              <div className="px-5 py-3.5 border-b border-white/[0.05] flex items-center justify-between">
                <span className="text-sm font-black text-white">Wallet Allocations</span>
                <span className="text-[11px] font-bold text-white/25">Epoch #{latest?.epochNumber ?? "-"}</span>
              </div>
              <div className="flex items-center gap-4 px-5 py-2 text-[10px] font-black text-white/20 uppercase tracking-widest bg-white/[0.01] border-b border-white/[0.04]">
                <div style={{width:36}}>#</div>
                <div className="flex-1">Wallet</div>
                <div style={{width:110}} className="text-right">Lamports</div>
                <div style={{width:80}} className="text-right">SOL</div>
              </div>
              <div className="divide-y divide-white/[0.04] max-h-[580px] overflow-y-auto">
                {distributions.map((r, i) => (
                  <div key={r.walletPubkey} className="flex items-center gap-4 px-5 py-3 hover:bg-white/[0.02] transition-colors">
                    <div style={{width:36}} className="text-[11px] text-white/25 font-mono">{i+1}</div>
                    <div className="flex-1 font-mono text-sm text-white/60 truncate">{shortPk(r.walletPubkey)}</div>
                    <div style={{width:110}} className="text-right font-mono text-[11px] text-white/25 tabular-nums">{r.amountLamports}</div>
                    <div style={{width:80}} className="text-right font-mono text-sm font-bold text-[#B6F04A] tabular-nums">{lamportsToSol(r.amountLamports)}</div>
                  </div>
                ))}
                {distributions.length===0 && <div className="px-5 py-8 text-sm text-white/25 text-center">No distributions yet</div>}
              </div>
            </div>
          </div>

          {/* Epoch history rail */}
          <div className="w-full lg:w-[280px] flex-shrink-0">
            <div className="rounded-xl border border-white/[0.06] bg-[#0b0c0e] overflow-hidden">
              <div className="px-5 py-3.5 border-b border-white/[0.05] flex items-center gap-2">
                <Calendar className="h-4 w-4 text-white/25" />
                <span className="text-sm font-black text-white">Epoch History</span>
              </div>
              <div className="divide-y divide-white/[0.04]">
                {recentEpochs.map((e) => (
                  <div key={e.id} className={`flex items-center justify-between px-5 py-3.5 hover:bg-white/[0.02] transition-colors ${
                    e.id===epochId ? "bg-[#B6F04A]/[0.03]" : ""
                  }`}>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-black text-white">#{e.epochNumber}</span>
                      {sb(statusLabel(e.status).variant, statusLabel(e.status).text)}
                    </div>
                    {e.id===epochId && <span className="text-[11px] font-bold text-[#B6F04A]">Current</span>}
                  </div>
                ))}
                {recentEpochs.length===0 && <div className="px-5 py-6 text-sm text-white/25 text-center">No epochs yet</div>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </HodlrLayout>
  );
}

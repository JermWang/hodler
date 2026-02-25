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

  return (
    <HodlrLayout>
      <div className="px-4 md:px-6 pt-6 pb-12">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Coins className="h-6 w-6 text-emerald-400" />
              <h1 className="text-2xl font-bold text-white">Distributions</h1>
            </div>
            <p className="text-sm text-[#9AA3B2]">Per-wallet reward allocations and epoch history</p>
          </div>
          {latest && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-[#9AA3B2]">Viewing Epoch</span>
              <span className="font-mono text-sm font-semibold text-white">#{latest.epochNumber}</span>
            </div>
          )}
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Main Content */}
          <div className="flex-1 min-w-0">
            {/* Stats Bar */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <div className="flex flex-col gap-1 p-3 rounded-lg border border-white/[0.06] bg-white/[0.02]">
                <span className="text-xs text-[#9AA3B2]">Total Pool</span>
                <span className="font-mono text-lg font-bold text-white">{lamportsToSol(totalLamports)} SOL</span>
              </div>
              <div className="flex flex-col gap-1 p-3 rounded-lg border border-white/[0.06] bg-white/[0.02]">
                <span className="text-xs text-[#9AA3B2]">Recipients</span>
                <span className="font-mono text-lg font-bold text-white">{distributions.length}</span>
              </div>
              <div className="flex flex-col gap-1 p-3 rounded-lg border border-white/[0.06] bg-white/[0.02]">
                <span className="text-xs text-[#9AA3B2]">Claimed</span>
                <span className="font-mono text-lg font-bold text-white">{epochStats?.claimedCount ?? 0}</span>
              </div>
              <div className="flex flex-col gap-1 p-3 rounded-lg border border-white/[0.06] bg-white/[0.02]">
                <span className="text-xs text-[#9AA3B2]">Claim Rate</span>
                <span className="font-mono text-lg font-bold text-emerald-400">
                  {epochStats && epochStats.eligibleCount > 0
                    ? Math.round((epochStats.claimedCount / epochStats.eligibleCount) * 100)
                    : 0}%
                </span>
              </div>
            </div>

            {/* Allocations List */}
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] overflow-hidden">
              <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
                <div className="text-sm font-semibold text-white">Wallet Allocations</div>
                <div className="text-xs text-[#9AA3B2]">Epoch #{latest?.epochNumber ?? "-"}</div>
              </div>

              {/* Header */}
              <div className="flex items-center gap-4 px-4 py-2 text-xs font-medium text-[#9AA3B2] uppercase tracking-wider bg-white/[0.02] border-b border-white/[0.06]">
                <div style={{ width: "40px" }}>#</div>
                <div className="flex-1">Wallet</div>
                <div style={{ width: "120px" }} className="text-right">Amount</div>
                <div style={{ width: "80px" }} className="text-right">SOL</div>
              </div>

              {/* Rows */}
              <div className="flex flex-col divide-y divide-white/[0.06] max-h-[600px] overflow-y-auto">
                {distributions.map((r, i) => (
                  <div
                    key={r.walletPubkey}
                    className="flex items-center gap-4 px-4 py-2.5 hover:bg-white/[0.03] transition-colors"
                  >
                    <div style={{ width: "40px" }} className="text-xs text-[#9AA3B2]">{i + 1}</div>
                    <div className="flex-1 font-mono text-sm text-white truncate">{shortPk(r.walletPubkey)}</div>
                    <div style={{ width: "120px" }} className="text-right font-mono text-xs text-[#9AA3B2]">
                      {r.amountLamports}
                    </div>
                    <div style={{ width: "80px" }} className="text-right font-mono text-sm text-emerald-400">
                      {lamportsToSol(r.amountLamports)}
                    </div>
                  </div>
                ))}

                {distributions.length === 0 && (
                  <div className="px-4 py-8 text-sm text-[#9AA3B2] text-center">No distributions yet</div>
                )}
              </div>
            </div>
          </div>

          {/* Right Rail - Epoch History */}
          <div className="w-full lg:w-[320px] flex-shrink-0">
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] overflow-hidden">
              <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2">
                <Calendar className="h-4 w-4 text-[#9AA3B2]" />
                <span className="text-sm font-semibold text-white">Epoch History</span>
              </div>
              <div className="flex flex-col divide-y divide-white/[0.06]">
                {recentEpochs.map((e) => (
                  <div
                    key={e.id}
                    className={`flex items-center justify-between px-4 py-3 hover:bg-white/[0.03] transition-colors ${
                      e.id === epochId ? "bg-emerald-500/[0.05]" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-white">#{e.epochNumber}</span>
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded border ${
                          statusLabel(e.status).variant === "success"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : statusLabel(e.status).variant === "warning"
                            ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                            : "bg-white/[0.03] text-[#9AA3B2] border-white/5"
                        }`}
                      >
                        {statusLabel(e.status).text}
                      </span>
                    </div>
                    {e.id === epochId && (
                      <span className="text-xs text-emerald-400">Current</span>
                    )}
                  </div>
                ))}

                {recentEpochs.length === 0 && (
                  <div className="px-4 py-6 text-sm text-[#9AA3B2] text-center">No epochs yet</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </HodlrLayout>
  );
}

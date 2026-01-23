"use client";

import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { Search, Zap, Rocket, ExternalLink, ChevronLeft, ChevronRight, Copy, Check, Trophy } from "lucide-react";

import { DataCard } from "@/app/components/ui/data-card";
import {
  RankingTable,
  RankingTableHeader,
  RankingTableHead,
  RankingTableBody,
  RankingTableRow,
  RankingTableCell,
  RankBadge,
  TrendIndicator,
} from "@/app/components/ui/ranking-table";

interface DiscoverToken {
  mint: string;
  name: string | null;
  symbol: string | null;
  bio?: string | null;
  priceUsd: string | null;
  marketCap: number | null;
  fdv: number | null;
  volume24h: number | null;
  liquidity: number | null;
  priceChange24h: number | null;
  pairAddress: string | null;
  dexScreenerUrl: string | null;
  imageUrl: string | null;
  createdAt: string | null;
  amplifi?: {
    commitmentId: string;
    statement: string | null;
    creatorPubkey: string | null;
    launchedAt: string;
    status: string;
  } | null;
}

const ITEMS_PER_PAGE = 12;

type RankingsPeriod = "all" | "24h" | "7d";

type GlobalRankingEntry = {
  rank: number;
  tokenMint: string;
  campaignId: string | null;
  name: string | null;
  symbol: string | null;
  imageUrl: string | null;
  exposureScore: number;
  uniqueEngagers: number;
  totalEarnedLamports: string;
  trendPct: number;
};

function lamportsToSol(lamports: string): string {
  const value = BigInt(lamports || "0");
  const sol = Number(value) / 1e9;
  return sol.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function formatExposure(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

function shortenMint(mint: string): string {
  const m = String(mint ?? "");
  if (m.length <= 10) return m;
  return `${m.slice(0, 4)}…${m.slice(-4)}`;
}

export default function DiscoverPage() {
  const router = useRouter();
  const [amplifiTokens, setAmplifiTokens] = useState<DiscoverToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [amplifiPage, setAmplifiPage] = useState(1);

  const [viewMode, setViewMode] = useState<"launches" | "rankings">("launches");
  const [rankingsPeriod, setRankingsPeriod] = useState<RankingsPeriod>("all");
  const [rankings, setRankings] = useState<GlobalRankingEntry[]>([]);
  const [rankingsLoading, setRankingsLoading] = useState(false);
  const [rankingsError, setRankingsError] = useState<string | null>(null);

  useEffect(() => {
    let canceled = false;

    const run = async () => {
      setLoading(true);
      try {
        const amplifiRes = await fetch("/api/discover/amplifi");
        const amplifiData = await amplifiRes.json();
        if (!canceled && amplifiData?.success) {
          setAmplifiTokens(Array.isArray(amplifiData.tokens) ? amplifiData.tokens : []);
        }
      } catch (e) {
        console.error("Failed to load discover data", e);
      } finally {
        if (!canceled) setLoading(false);
      }
    };

    run();
    return () => {
      canceled = true;
    };
  }, []);

  useEffect(() => {
    if (viewMode !== "rankings") return;

    let canceled = false;
    const run = async () => {
      setRankingsLoading(true);
      setRankingsError(null);
      try {
        const sp = new URLSearchParams();
        sp.set("period", rankingsPeriod);
        sp.set("limit", "50");
        const res = await fetch(`/api/discover/rankings?${sp.toString()}`, { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(String(json?.error || "Failed to fetch rankings"));
        const entries = Array.isArray(json?.entries) ? (json.entries as GlobalRankingEntry[]) : [];
        if (!canceled) setRankings(entries);
      } catch (e) {
        if (!canceled) setRankingsError(e instanceof Error ? e.message : "Failed to fetch rankings");
      } finally {
        if (!canceled) setRankingsLoading(false);
      }
    };

    run();
    return () => {
      canceled = true;
    };
  }, [viewMode, rankingsPeriod]);

  const filteredAmplifiTokens = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return amplifiTokens;
    return amplifiTokens.filter((t) => {
      const name = String(t.name ?? "").toLowerCase();
      const symbol = String(t.symbol ?? "").toLowerCase();
      const mint = String(t.mint ?? "").toLowerCase();
      return name.includes(q) || symbol.includes(q) || mint.includes(q);
    });
  }, [amplifiTokens, searchQuery]);

  // Reset page when search changes
  useEffect(() => {
    setAmplifiPage(1);
  }, [searchQuery]);

  const amplifiTotalPages = Math.ceil(filteredAmplifiTokens.length / ITEMS_PER_PAGE);

  const paginatedAmplifiTokens = useMemo(() => {
    const start = (amplifiPage - 1) * ITEMS_PER_PAGE;
    return filteredAmplifiTokens.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredAmplifiTokens, amplifiPage]);

  return (
    <div className="min-h-screen bg-dark-bg">
      <section className="relative overflow-hidden border-b border-dark-border">
        <div className="absolute inset-0 bg-gradient-to-br from-amplifi-purple/10 via-dark-bg to-amplifi-lime/5" />
        <div className="relative mx-auto max-w-[1280px] px-4 md:px-6 pt-20 md:pt-24 pb-8 md:pb-12">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amplifi-lime/10 border border-amplifi-lime/20 text-amplifi-lime text-sm font-medium mb-6">
              <Rocket className="h-4 w-4" />
              Token Discovery
            </div>

            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight">Discover</h1>
            <p className="text-lg text-foreground-secondary mb-8 max-w-2xl">
              Explore projects launched through AmpliFi.
            </p>

            <div className="relative max-w-xl">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-foreground-muted" />
              <input
                type="text"
                placeholder="Search tokens by name, symbol, or mint..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-14 pl-12 pr-4 rounded-xl border border-dark-border bg-dark-surface text-white placeholder:text-foreground-muted focus:outline-none focus:ring-2 focus:ring-amplifi-lime/30 focus:border-amplifi-lime/50 transition-all"
              />
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1280px] px-4 md:px-6 py-8 md:py-12">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-amplifi-lime border-t-transparent" />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-white">AmpliFi Launches</h2>
                <p className="text-sm text-foreground-secondary">Projects launched through AmpliFi</p>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 bg-dark-elevated rounded-xl p-1">
                  <button
                    onClick={() => setViewMode("launches")}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                      viewMode === "launches"
                        ? "bg-amplifi-lime/20 text-amplifi-lime border border-amplifi-lime/20"
                        : "text-foreground-secondary hover:bg-dark-surface"
                    }`}
                  >
                    Launches
                  </button>
                  <button
                    onClick={() => setViewMode("rankings")}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                      viewMode === "rankings"
                        ? "bg-amplifi-lime/20 text-amplifi-lime border border-amplifi-lime/20"
                        : "text-foreground-secondary hover:bg-dark-surface"
                    }`}
                  >
                    Global Rankings
                  </button>
                </div>
              </div>
            </div>

            {viewMode === "rankings" ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2 text-foreground-secondary">
                    <Trophy className="h-4 w-4" />
                    <span className="text-sm">All projects ranked by impact</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {([
                      { key: "all" as const, label: "All Time" },
                      { key: "24h" as const, label: "24h" },
                      { key: "7d" as const, label: "7d" },
                    ] as const).map((p) => (
                      <button
                        key={p.key}
                        onClick={() => setRankingsPeriod(p.key)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                          rankingsPeriod === p.key
                            ? "bg-amplifi-lime/10 text-amplifi-lime border border-amplifi-lime/20"
                            : "text-foreground-secondary hover:bg-dark-elevated"
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <DataCard className="overflow-hidden p-0">
                  {rankingsLoading ? (
                    <div className="flex items-center justify-center py-20">
                      <div className="animate-spin rounded-full h-10 w-10 border-2 border-amplifi-lime border-t-transparent" />
                    </div>
                  ) : rankingsError ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10 mb-4">
                        <Trophy className="h-8 w-8 text-red-400" />
                      </div>
                      <h3 className="text-lg font-semibold text-white mb-2">Failed to load rankings</h3>
                      <p className="text-sm text-foreground-secondary max-w-sm">{rankingsError}</p>
                    </div>
                  ) : rankings.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-dark-surface mb-4">
                        <Trophy className="h-8 w-8 text-foreground-secondary" />
                      </div>
                      <h3 className="text-lg font-semibold text-white mb-2">No rankings yet</h3>
                      <p className="text-sm text-foreground-secondary max-w-sm">Rankings appear after campaigns start collecting engagement.</p>
                    </div>
                  ) : (
                    <RankingTable>
                      <RankingTableHeader>
                        <RankingTableHead className="w-16">Rank</RankingTableHead>
                        <RankingTableHead>Project</RankingTableHead>
                        <RankingTableHead align="right" sortable>Exposure Earned</RankingTableHead>
                        <RankingTableHead align="right">Engagers</RankingTableHead>
                        <RankingTableHead align="right" sortable>Team Payouts</RankingTableHead>
                        <RankingTableHead align="right">Trend</RankingTableHead>
                      </RankingTableHeader>
                      <RankingTableBody>
                        {rankings
                          .filter((r) => {
                            const q = searchQuery.trim().toLowerCase();
                            if (!q) return true;
                            const name = String(r.name ?? "").toLowerCase();
                            const sym = String(r.symbol ?? "").toLowerCase();
                            const mint = String(r.tokenMint ?? "").toLowerCase();
                            return name.includes(q) || sym.includes(q) || mint.includes(q);
                          })
                          .map((row) => (
                            <RankingTableRow
                              key={row.tokenMint}
                              highlight={row.rank <= 3}
                              onClick={
                                row.campaignId
                                  ? () => router.push(`/campaigns/${encodeURIComponent(row.campaignId)}/leaderboard`)
                                  : undefined
                              }
                            >
                              <RankingTableCell>
                                <RankBadge rank={row.rank} />
                              </RankingTableCell>
                              <RankingTableCell>
                                <div className="flex items-center gap-3">
                                  {row.imageUrl ? (
                                    <img src={row.imageUrl} alt={row.name || ""} className="h-8 w-8 rounded-full object-cover" />
                                  ) : (
                                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-amplifi-purple to-amplifi-teal flex items-center justify-center text-white font-bold text-xs">
                                      {String(row.symbol ?? "??").slice(0, 2)}
                                    </div>
                                  )}
                                  <div>
                                    <div className="font-medium text-white">{row.name || "Unknown"}</div>
                                    <div className="text-xs text-foreground-secondary">{row.symbol ? `$${row.symbol}` : shortenMint(row.tokenMint)}</div>
                                  </div>
                                </div>
                              </RankingTableCell>
                              <RankingTableCell align="right">
                                <span className="font-semibold text-white">{formatExposure(row.exposureScore)}</span>
                              </RankingTableCell>
                              <RankingTableCell align="right">
                                <span className="font-semibold text-white">{Number(row.uniqueEngagers || 0).toLocaleString()}</span>
                              </RankingTableCell>
                              <RankingTableCell align="right">
                                <span className="text-white">{lamportsToSol(row.totalEarnedLamports)} SOL</span>
                              </RankingTableCell>
                              <RankingTableCell align="right">
                                <TrendIndicator value={Number(row.trendPct || 0)} />
                              </RankingTableCell>
                            </RankingTableRow>
                          ))}
                      </RankingTableBody>
                    </RankingTable>
                  )}
                </DataCard>
              </> 
            ) : filteredAmplifiTokens.length === 0 ? (
              <DataCard className="py-16">
                <div className="flex flex-col items-center justify-center text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-dark-surface mb-4">
                    <Zap className="h-8 w-8 text-foreground-secondary" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">{searchQuery ? "No results" : "No launches yet"}</h3>
                  <p className="text-sm text-foreground-secondary max-w-sm">{searchQuery ? "Try a different search." : "Be the first to launch!"}</p>
                </div>
              </DataCard>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {paginatedAmplifiTokens.map((token) => (
                    <TokenCard key={token.mint} token={token} accent="teal" isAmplifi />
                  ))}
                </div>
                {amplifiTotalPages > 1 && (
                  <Pagination
                    currentPage={amplifiPage}
                    totalPages={amplifiTotalPages}
                    onPageChange={setAmplifiPage}
                  />
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Pagination({
  currentPage,
  totalPages,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  const pages: (number | "...")[] = [];
  
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (currentPage > 3) pages.push("...");
    
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);
    
    for (let i = start; i <= end; i++) pages.push(i);
    
    if (currentPage < totalPages - 2) pages.push("...");
    pages.push(totalPages);
  }

  return (
    <div className="flex items-center justify-center gap-2 mt-8">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className="p-2 rounded-lg border border-dark-border bg-dark-surface text-foreground-secondary hover:text-white hover:border-amplifi-lime/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      
      {pages.map((page, idx) =>
        page === "..." ? (
          <span key={`ellipsis-${idx}`} className="px-2 text-foreground-muted">...</span>
        ) : (
          <button
            key={page}
            onClick={() => onPageChange(page)}
            className={`min-w-[40px] h-10 rounded-lg border text-sm font-medium transition-colors ${
              currentPage === page
                ? "border-amplifi-lime bg-amplifi-lime/10 text-amplifi-lime"
                : "border-dark-border bg-dark-surface text-foreground-secondary hover:text-white hover:border-amplifi-lime/30"
            }`}
          >
            {page}
          </button>
        )
      )}
      
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="p-2 rounded-lg border border-dark-border bg-dark-surface text-foreground-secondary hover:text-white hover:border-amplifi-lime/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  );
}

function formatMarketCap(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "-";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function formatPriceChange(value: number | null): { text: string; positive: boolean } {
  if (value == null || !Number.isFinite(value)) return { text: "-", positive: true };
  const positive = value >= 0;
  return { text: `${positive ? "+" : ""}${value.toFixed(2)}%`, positive };
}

function TokenCard({ token, accent, isAmplifi }: { token: DiscoverToken; accent: "purple" | "teal"; isAmplifi?: boolean }) {
  const priceChange = formatPriceChange(token.priceChange24h);
  const [copied, setCopied] = useState(false);

  const mint = String(token.mint ?? "");
  const mintShort = mint.length > 10 ? `${mint.slice(0, 4)}…${mint.slice(-4)}` : mint;

  const onCopyMint = async (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!mint) return;
    try {
      await navigator.clipboard.writeText(mint);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
    }
  };

  return (
    <a
      href={isAmplifi ? `https://pump.fun/coin/${token.mint}` : token.dexScreenerUrl || `https://dexscreener.com/solana/${token.mint}`}
      target="_blank"
      rel="noopener noreferrer"
      className="block"
    >
      <div className="group relative overflow-hidden rounded-2xl border border-dark-border/40 bg-dark-surface/50 backdrop-blur-sm transition-all duration-300 hover:border-amplifi-lime/30 hover:shadow-[0_8px_32px_rgba(182,240,74,0.12)] hover:scale-[1.02]">
        {/* Large Image Area */}
        <div className="relative aspect-[4/3] overflow-hidden bg-dark-elevated">
          {token.imageUrl ? (
            <img
              src={token.imageUrl}
              alt={token.name || "Token"}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-amplifi-purple/20 to-amplifi-teal/20">
              <Rocket className="h-10 w-10 text-amplifi-teal/50" />
            </div>
          )}
          
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-dark-bg via-dark-bg/20 to-transparent" />
          
          {/* Price change badge - top right */}
          <div className={`absolute top-3 right-3 px-2.5 py-1 rounded-lg text-xs font-bold backdrop-blur-md border ${
            priceChange.positive 
              ? "bg-amplifi-lime/20 text-amplifi-lime border-amplifi-lime/30" 
              : "bg-red-500/20 text-red-400 border-red-500/30"
          }`}>
            {priceChange.text}
          </div>

          {/* AmpliFi badge - top left */}
          {isAmplifi && token.amplifi && (
            <div className="absolute top-3 left-3 px-2.5 py-1 rounded-lg text-xs font-bold bg-amplifi-teal/20 text-amplifi-teal border border-amplifi-teal/30 backdrop-blur-md">
              AmpliFi
            </div>
          )}

          {/* Token info overlay - bottom */}
          <div className="absolute bottom-0 left-0 right-0 p-4">
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-base font-bold text-white truncate">{token.name || "Unknown"}</h3>
                <p className="text-xs text-foreground-secondary font-medium">{token.symbol ? `$${token.symbol}` : "-"}</p>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-bold text-white">{formatMarketCap(token.marketCap)}</div>
                <div className="text-[10px] text-foreground-muted">MCap</div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom stats bar */}
        <div className="p-2 border-t border-dark-border/40">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 text-xs text-foreground-secondary">
              <span>Vol: {formatMarketCap(token.volume24h)}</span>
              <span className="text-dark-border">•</span>
              <span>Liq: {formatMarketCap(token.liquidity)}</span>
            </div>
            <button
              type="button"
              onClick={onCopyMint}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-foreground-secondary hover:text-amplifi-lime transition-colors"
              aria-label="Copy contract address"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-amplifi-lime" /> : <Copy className="h-3.5 w-3.5" />}
              {mintShort}
            </button>
          </div>
        </div>
      </div>
    </a>
  );
}

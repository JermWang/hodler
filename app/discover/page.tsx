"use client";

import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { Search, Zap, Rocket, ExternalLink, ChevronLeft, ChevronRight, Copy, Check } from "lucide-react";

import { DataCard } from "@/app/components/ui/data-card";

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

export default function DiscoverPage() {
  const [amplifiTokens, setAmplifiTokens] = useState<DiscoverToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [amplifiPage, setAmplifiPage] = useState(1);

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
        <div className="relative mx-auto max-w-[1280px] px-6 pt-24 pb-12">
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

      <div className="mx-auto max-w-[1280px] px-6 py-12">
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
            </div>
            {filteredAmplifiTokens.length === 0 ? (
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
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
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
  const accentColor = accent === "purple" ? "amplifi-purple" : "amplifi-teal";
  const [copied, setCopied] = useState(false);

  const mint = String(token.mint ?? "");
  const mintShort = mint.length > 10 ? `${mint.slice(0, 4)}…${mint.slice(-4)}` : mint;
  const bio = String(token.bio ?? "").trim();

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
    >
      <DataCard className="group h-full hover-shimmer transition-all cursor-pointer">
        <div className="p-4">
          <div className="flex items-start gap-3 mb-3">
            {token.imageUrl ? (
              <img
                src={token.imageUrl}
                alt={token.name || "Token"}
                className="w-14 h-14 rounded-xl object-cover bg-dark-surface"
              />
            ) : (
              <div className="w-14 h-14 rounded-xl bg-dark-surface flex items-center justify-center">
                <Rocket className={`h-7 w-7 text-${accentColor}`} />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h3 className="text-white font-semibold truncate">{token.name || "Unknown"}</h3>
              <p className="text-sm text-foreground-secondary">{token.symbol ? `$${token.symbol}` : "-"}</p>
              {bio ? (
                <p
                  className="text-xs text-foreground-muted mt-1"
                  style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
                >
                  {bio}
                </p>
              ) : null}
            </div>
            {isAmplifi && token.amplifi && (
              <span className="text-xs px-2 py-1 rounded-full bg-amplifi-teal/10 text-amplifi-teal font-medium">
                AmpliFi
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <div className="text-lg font-bold text-white">{formatMarketCap(token.marketCap)}</div>
              <div className="text-xs text-foreground-secondary">Market Cap</div>
            </div>
            <div>
              <div className={`text-lg font-bold ${priceChange.positive ? "text-amplifi-lime" : "text-red-400"}`}>
                {priceChange.text}
              </div>
              <div className="text-xs text-foreground-secondary">24h Change</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-dark-border">
            <div>
              <div className="text-sm font-medium text-foreground-secondary">{formatMarketCap(token.volume24h)}</div>
              <div className="text-xs text-foreground-muted">24h Volume</div>
            </div>
            <div>
              <div className="text-sm font-medium text-foreground-secondary">{formatMarketCap(token.liquidity)}</div>
              <div className="text-xs text-foreground-muted">Liquidity</div>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs text-foreground-muted">Contract</div>
              <div className="text-sm font-semibold text-white truncate">{mintShort || "-"}</div>
            </div>
            <button
              type="button"
              onClick={onCopyMint}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-dark-border bg-dark-surface px-2.5 py-1.5 text-xs font-medium text-foreground-secondary hover:text-white hover:border-amplifi-lime/30 transition-colors"
              aria-label="Copy contract address"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-amplifi-lime" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>

          <div className="mt-3 flex items-center justify-between text-sm">
            <span className="text-foreground-secondary group-hover:text-amplifi-lime transition-colors">
              {isAmplifi ? "View on Pump.fun" : "View on DexScreener"}
            </span>
            <ExternalLink className="h-4 w-4 text-foreground-secondary group-hover:text-amplifi-lime transition-all" />
          </div>
        </div>
      </DataCard>
    </a>
  );
}

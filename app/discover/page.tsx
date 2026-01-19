"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Zap, Rocket, ExternalLink } from "lucide-react";

import { DataCard } from "@/app/components/ui/data-card";

interface DiscoverToken {
  mint: string;
  name: string | null;
  symbol: string | null;
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

type TabId = "bags" | "amplifi";

export default function DiscoverPage() {
  const [activeTab, setActiveTab] = useState<TabId>("bags");
  const [bagsTokens, setBagsTokens] = useState<DiscoverToken[]>([]);
  const [amplifiTokens, setAmplifiTokens] = useState<DiscoverToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    let canceled = false;

    const run = async () => {
      setLoading(true);
      try {
        const [bagsRes, amplifiRes] = await Promise.all([
          fetch("/api/discover/bags?minMarketCap=10000"),
          fetch("/api/discover/amplifi"),
        ]);

        const bagsData = await bagsRes.json();
        if (!canceled && bagsData?.success) {
          setBagsTokens(Array.isArray(bagsData.tokens) ? bagsData.tokens : []);
        }

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

  const filteredBagsTokens = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return bagsTokens;
    return bagsTokens.filter((t) => {
      const name = String(t.name ?? "").toLowerCase();
      const symbol = String(t.symbol ?? "").toLowerCase();
      const mint = String(t.mint ?? "").toLowerCase();
      return name.includes(q) || symbol.includes(q) || mint.includes(q);
    });
  }, [bagsTokens, searchQuery]);

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
              Explore Bags.fm launches and projects powered by AmpliFi.
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
        <div className="flex gap-2 mb-8 border-b border-dark-border">
          <button
            onClick={() => setActiveTab("bags")}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "bags"
                ? "border-amplifi-purple text-amplifi-purple"
                : "border-transparent text-foreground-secondary hover:text-white"
            }`}
          >
            <Rocket className="inline h-4 w-4 mr-2" />
            Bags.fm ({bagsTokens.length})
          </button>
          <button
            onClick={() => setActiveTab("amplifi")}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "amplifi"
                ? "border-amplifi-teal text-amplifi-teal"
                : "border-transparent text-foreground-secondary hover:text-white"
            }`}
          >
            <Zap className="inline h-4 w-4 mr-2" />
            AmpliFi ({amplifiTokens.length})
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-amplifi-lime border-t-transparent" />
          </div>
        ) : activeTab === "bags" ? (
          <>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-white">Bags.fm Launches</h2>
                <p className="text-sm text-foreground-secondary">Tokens launched on Bags.fm with $10k+ market cap</p>
              </div>
              <a
                href="https://bags.fm"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-amplifi-purple hover:text-amplifi-purple/80 transition-colors"
              >
                Visit Bags.fm <ExternalLink className="h-4 w-4" />
              </a>
            </div>
            {filteredBagsTokens.length === 0 ? (
              <DataCard className="py-16">
                <div className="flex flex-col items-center justify-center text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-dark-surface mb-4">
                    <Rocket className="h-8 w-8 text-foreground-secondary" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">{searchQuery ? "No results" : "No tokens found"}</h3>
                  <p className="text-sm text-foreground-secondary max-w-sm">{searchQuery ? "Try a different search." : "Check back soon."}</p>
                </div>
              </DataCard>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredBagsTokens.map((token) => (
                  <TokenCard key={token.mint} token={token} accent="purple" />
                ))}
              </div>
            )}
          </>
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
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredAmplifiTokens.map((token) => (
                  <TokenCard key={token.mint} token={token} accent="teal" isAmplifi />
                ))}
              </div>
            )}
          </>
        )}
      </div>
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

  return (
    <a
      href={token.dexScreenerUrl || `https://dexscreener.com/solana/${token.mint}`}
      target="_blank"
      rel="noopener noreferrer"
    >
      <DataCard className="group h-full hover:border-amplifi-lime/30 transition-all cursor-pointer">
        <div className="p-5">
          <div className="flex items-start gap-3 mb-4">
            {token.imageUrl ? (
              <img
                src={token.imageUrl}
                alt={token.name || "Token"}
                className="w-12 h-12 rounded-xl object-cover bg-dark-surface"
              />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-dark-surface flex items-center justify-center">
                <Rocket className={`h-6 w-6 text-${accentColor}`} />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h3 className="text-white font-semibold truncate">{token.name || "Unknown"}</h3>
              <p className="text-sm text-foreground-secondary">{token.symbol ? `$${token.symbol}` : "-"}</p>
            </div>
            {isAmplifi && token.amplifi && (
              <span className="text-xs px-2 py-1 rounded-full bg-amplifi-teal/10 text-amplifi-teal font-medium">
                AmpliFi
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <div className="text-lg font-bold text-white">{formatMarketCap(token.marketCap)}</div>
              <div className="text-xs text-foreground-secondary">Market Cap</div>
            </div>
            <div>
              <div className={`text-lg font-bold ${priceChange.positive ? "text-green-400" : "text-red-400"}`}>
                {priceChange.text}
              </div>
              <div className="text-xs text-foreground-secondary">24h Change</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-dark-border">
            <div>
              <div className="text-sm font-medium text-foreground-secondary">{formatMarketCap(token.volume24h)}</div>
              <div className="text-xs text-foreground-muted">24h Volume</div>
            </div>
            <div>
              <div className="text-sm font-medium text-foreground-secondary">{formatMarketCap(token.liquidity)}</div>
              <div className="text-xs text-foreground-muted">Liquidity</div>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-foreground-secondary group-hover:text-amplifi-lime transition-colors">View on DexScreener</span>
            <ExternalLink className="h-4 w-4 text-foreground-secondary group-hover:text-amplifi-lime transition-all" />
          </div>
        </div>
      </DataCard>
    </a>
  );
}

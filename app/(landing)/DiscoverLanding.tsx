"use client";

import { useState } from "react";
import Link from "next/link";
import { 
  TrendingUp, Users, Zap, Award, ArrowRight, 
  ChevronRight, ChevronDown, Flame, Star, BarChart3, Wallet, Trophy, PlayCircle
} from "lucide-react";
import { useOnboarding } from "@/app/components/OnboardingProvider";
import { DataCard, DataCardHeader, MetricDisplay, ExposureStat } from "@/app/components/ui/data-card";
import { CoinCard, CoinCardCompact } from "@/app/components/ui/coin-card";
import { ActivityFeed, ActivityItem, StatusBadge } from "@/app/components/ui/activity-feed";
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
import { 
  HowItWorks, 
  FeeSplitBar, 
  EngagementPointsLegend,
  ValuePropsSection 
} from "@/app/components/ui/amplifi-components";
import { Copy, Check } from "lucide-react";

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_TOKEN_CONTRACT_ADDRESS || "coming soon";

function ContractCopyButton() {
  const [copied, setCopied] = useState(false);
  const hasAddress = CONTRACT_ADDRESS !== "coming soon" && CONTRACT_ADDRESS.length > 10;

  const handleCopy = async () => {
    if (!hasAddress) {
      // Still show feedback even if no address
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      return;
    }
    try {
      await navigator.clipboard.writeText(CONTRACT_ADDRESS);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={`hover-shimmer group inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-mono backdrop-blur-md transition-all duration-200 cursor-pointer active:scale-[0.98] ${
        copied 
          ? "border-amplifi-lime/50 bg-amplifi-lime/15 text-amplifi-lime shadow-[0_0_12px_rgba(182,240,74,0.25)]" 
          : "border-white/20 bg-white/5 text-foreground-secondary"
      }`}
      style={{ "--shimmer-bg": "rgba(11, 12, 14, 0.95)", "--shimmer-radius": "12px" } as React.CSSProperties}
    >
      <span className="truncate max-w-[280px] sm:max-w-none relative z-10">
        {copied ? (hasAddress ? "✓ Copied!" : "Coming Soon!") : CONTRACT_ADDRESS}
      </span>
      {!copied && hasAddress && (
        <Copy className="h-4 w-4 text-foreground-muted group-hover:text-amplifi-lime transition-colors shrink-0 relative z-10" />
      )}
      {copied && <Check className="h-4 w-4 text-amplifi-lime shrink-0 relative z-10" />}
    </button>
  );
}

// Featured projects data with local token images
const featuredCoins = [
  { id: "1", name: "Gigachad", symbol: "GIGA", exposureScore: 847293, payoutRank: 1, trend: 24.5, holders: 12847, twitter: "@gigaborium", imageUrl: "/tokens/giga.png" },
  { id: "2", name: "Popcat", symbol: "POPCAT", exposureScore: 623847, payoutRank: 2, trend: 18.2, holders: 9234, twitter: "@Popcatsolana", imageUrl: "/tokens/popcat.png" },
  { id: "3", name: "Bonk", symbol: "BONK", exposureScore: 512938, payoutRank: 3, trend: -5.3, holders: 7891, twitter: "@bonaborium", imageUrl: "/tokens/bonk.png" },
  { id: "4", name: "Fartcoin", symbol: "FART", exposureScore: 398472, payoutRank: 4, trend: 12.8, holders: 6234, twitter: "@fartaboriumcoin", imageUrl: "/tokens/fartcoin.png" },
];

const recentActivity = [
  { id: "1", type: "payout", title: "$GIGA", subtitle: "Epoch 24 settled", value: "+2.4 SOL", time: "2m ago" },
  { id: "2", type: "holder", title: "@sol_trader", subtitle: "Joined $POPCAT campaign", value: null, time: "5m ago" },
  { id: "3", type: "exposure", title: "$BONK", subtitle: "Exposure milestone reached", value: "+500K", time: "12m ago" },
  { id: "4", type: "payout", title: "$FART", subtitle: "Holder rewards distributed", value: "+1.8 SOL", time: "18m ago" },
  { id: "5", type: "trending", title: "$WIF", subtitle: "Trending in last 24h", value: "+156%", time: "25m ago" },
];

const globalRankings = [
  { rank: 1, name: "Gigachad", symbol: "GIGA", exposure: "847,293", holderROI: 342, teamPayouts: "124.5 SOL", trend: 24.5, twitter: "@gigaborium", imageUrl: "/tokens/giga.png" },
  { rank: 2, name: "Popcat", symbol: "POPCAT", exposure: "623,847", holderROI: 287, teamPayouts: "98.2 SOL", trend: 18.2, twitter: "@Popcatsolana", imageUrl: "/tokens/popcat.png" },
  { rank: 3, name: "Bonk", symbol: "BONK", exposure: "512,938", holderROI: 198, teamPayouts: "76.8 SOL", trend: -5.3, twitter: "@bonaborium", imageUrl: "/tokens/bonk.png" },
  { rank: 4, name: "Fartcoin", symbol: "FART", exposure: "398,472", holderROI: 156, teamPayouts: "54.3 SOL", trend: 12.8, twitter: "@fartaboriumcoin", imageUrl: "/tokens/fartcoin.png" },
  { rank: 5, name: "dogwifhat", symbol: "WIF", exposure: "312,847", holderROI: 134, teamPayouts: "42.1 SOL", trend: 156.2, twitter: "@dogwifcoin", imageUrl: "/tokens/wif.png" },
  { rank: 6, name: "Peanut", symbol: "PNUT", exposure: "287,394", holderROI: 112, teamPayouts: "38.7 SOL", trend: 8.4, twitter: "@pnutsolana", imageUrl: "/tokens/pnut.png" },
  { rank: 7, name: "Goatseus", symbol: "GOAT", exposure: "234,928", holderROI: 98, teamPayouts: "31.2 SOL", trend: -2.1, twitter: "@GoatseusMaximus", imageUrl: "/tokens/goat.png" },
  { rank: 8, name: "ai16z", symbol: "AI16Z", exposure: "198,472", holderROI: 87, teamPayouts: "26.8 SOL", trend: 5.7, twitter: "@ai16zdao", imageUrl: "/tokens/ai16z.png" },
];

const topHolders = [
  { rank: 1, address: "7xKp...4Fp", twitter: "@sol_maxi", earnings: "48.2 SOL", campaigns: 12, score: 98 },
  { rank: 2, address: "Dk4v...mN2", twitter: "@degen_ape", earnings: "42.7 SOL", campaigns: 9, score: 94 },
  { rank: 3, address: "9eHj...rT5", twitter: "@memecoin_hunter", earnings: "38.1 SOL", campaigns: 15, score: 91 },
  { rank: 4, address: "5aRq...vD8", twitter: "@solana_chad", earnings: "31.5 SOL", campaigns: 8, score: 87 },
  { rank: 5, address: "3cWm...kF1", twitter: "@ct_intern", earnings: "27.3 SOL", campaigns: 11, score: 84 },
];

export default function DiscoverPage() {

  return (
    <div className="min-h-screen">
      {/* Hero Section - Full viewport height */}
      <section className="relative overflow-hidden border-b border-dark-border/60 min-h-screen flex flex-col justify-center">
        {/* Gradient Background - semi-transparent to let ASCII show */}
        <div className="absolute inset-0 bg-gradient-to-br from-amplifi-purple/10 via-transparent to-amplifi-lime/5" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-amplifi-lime/5 blur-[120px] rounded-full" />
        
        <div className="relative mx-auto max-w-[1280px] px-4 md:px-6 py-16 md:py-28">
          <div className="max-w-4xl mx-auto text-center">
            {/* Large stacked headline - center aligned */}
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl font-black text-white tracking-tight leading-[0.95]">
              <span className="block">HOLD TOKENS.</span>
              <span className="block text-transparent bg-clip-text bg-gradient-to-r from-amplifi-lime to-amplifi-yellow">
                TWEET.
              </span>
              <span className="block text-transparent bg-clip-text bg-gradient-to-r from-amplifi-yellow to-amplifi-lime">
                GET PAID.
              </span>
            </h1>
            
            {/* Tagline - center aligned, constrained width */}
            <p className="text-base md:text-lg text-foreground-secondary mt-8 md:mt-10 max-w-lg mx-auto leading-relaxed">
              AmpliFi is a Pump.fun-native launch toolkit that rewards real social impact. 50% of creator rewards are shared with the engagers who create momentum.
            </p>

            {/* CTAs - center aligned */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-8">
              <ContractCopyButton />
              <button
                type="button"
                onClick={() => {
                  const el = document.getElementById("landing-content");
                  el?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-amplifi-lime/30 bg-amplifi-lime/10 text-amplifi-lime text-sm font-medium hover:bg-amplifi-lime/20 transition-all"
              >
                How it works
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>

          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            const el = document.getElementById("landing-content");
            el?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
          className="absolute bottom-20 left-1/2 -translate-x-1/2 inline-flex flex-col items-center gap-1 text-foreground-muted hover:text-white transition-colors"
          aria-label="Scroll down"
        >
          <span className="text-xs tracking-wide">Scroll</span>
          <ChevronDown className="h-5 w-5 animate-bounce" />
        </button>
      </section>

      {/* How It Works Section */}
      <div id="landing-content" className="mx-auto max-w-[1280px] px-4 md:px-6 scroll-mt-20 md:scroll-mt-24">
        <HowItWorks />
      </div>

      <div className="mx-auto max-w-[1280px] px-4 md:px-6 py-10 md:py-16">
        {/* Engagement Points + Fee Split Row */}
        <div className="grid lg:grid-cols-2 gap-8 mb-16 items-stretch">
          <EngagementPointsLegend />
          <FeeSplitBar totalFee={10} currency="SOL" />
        </div>

        {/* Top Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          <DataCard variant="elevated" className="p-4">
            <ExposureStat
              icon={<TrendingUp className="h-5 w-5" />}
              value="$847K"
              label="Total Exposure Today"
              trend="up"
              trendValue="+12.4%"
            />
          </DataCard>
          <DataCard variant="elevated" className="p-4">
            <ExposureStat
              icon={<Wallet className="h-5 w-5" />}
              value="142.8 SOL"
              label="Payouts (24h)"
              trend="up"
              trendValue="+8.2%"
            />
          </DataCard>
          <DataCard variant="elevated" className="p-4">
            <ExposureStat
              icon={<Users className="h-5 w-5" />}
              value="3,847"
              label="Active Holders"
              trend="up"
              trendValue="+156"
            />
          </DataCard>
          <DataCard variant="elevated" className="p-4">
            <ExposureStat
              icon={<Award className="h-5 w-5" />}
              value="287%"
              label="Avg. Holder ROI"
              trend="up"
              trendValue="+24%"
            />
          </DataCard>
        </div>

        {/* Main Content Grid */}
        <div className="grid lg:grid-cols-3 gap-8 mb-12">
          {/* Recent Activity */}
          <DataCard className="lg:col-span-1">
            <DataCardHeader 
              title="Recent Activity" 
              subtitle="Live updates"
              action={
                <Link href="/campaigns" className="text-xs text-amplifi-lime hover:underline flex items-center gap-1">
                  View all <ChevronRight className="h-3 w-3" />
                </Link>
              }
            />
            <ActivityFeed>
              {recentActivity.map((item) => (
                <ActivityItem
                  key={item.id}
                  icon={
                    item.type === "payout" ? <Wallet className="h-4 w-4" /> :
                    item.type === "holder" ? <Users className="h-4 w-4" /> :
                    item.type === "exposure" ? <Zap className="h-4 w-4" /> :
                    <Flame className="h-4 w-4" />
                  }
                  title={item.title}
                  subtitle={item.subtitle}
                  value={item.value || undefined}
                  valueColor={item.type === "payout" ? "lime" : item.type === "exposure" ? "teal" : "purple"}
                  timestamp={item.time}
                />
              ))}
            </ActivityFeed>
          </DataCard>

          {/* Top Holders Leaderboard */}
          <DataCard className="lg:col-span-2">
            <DataCardHeader 
              title="Top Holders" 
              subtitle="Highest earners this epoch"
              action={
                <Link href="/holder" className="text-xs text-amplifi-lime hover:underline flex items-center gap-1">
                  Full leaderboard <ChevronRight className="h-3 w-3" />
                </Link>
              }
            />
            <div className="space-y-2">
              {topHolders.map((holder) => (
                <div
                  key={holder.rank}
                  className="flex items-center gap-4 p-3 rounded-xl bg-dark-elevated/40 backdrop-blur-sm hover:bg-dark-elevated/60 transition-colors"
                >
                  <RankBadge rank={holder.rank} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white">{holder.twitter}</div>
                    <div className="text-xs text-foreground-secondary">
                      <span className="font-mono">{holder.address}</span> · {holder.campaigns} campaigns
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-amplifi-lime">{holder.earnings}</div>
                    <div className="text-xs text-foreground-secondary">earned</div>
                  </div>
                </div>
              ))}
            </div>
          </DataCard>
        </div>

        {/* Featured Coins */}
        <section className="mb-12">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-white">Featured Coins</h2>
              <p className="text-sm text-foreground-secondary">Top performing projects by exposure</p>
            </div>
            <Link 
              href="/campaigns" 
              className="flex items-center gap-2 text-sm text-amplifi-lime hover:text-amplifi-lime-dark transition-colors"
            >
              View all coins <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {featuredCoins.map((coin) => (
              <CoinCard
                key={coin.id}
                name={coin.name}
                symbol={coin.symbol}
                logo={coin.imageUrl}
                exposureScore={coin.exposureScore}
                payoutRank={coin.payoutRank}
                trend={coin.trend}
                holders={coin.holders}
                twitter={coin.twitter}
                onClick={() => {}}
              />
            ))}
          </div>
        </section>

        {/* Global Rankings Table */}
        <section className="mb-12">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-white">Global Rankings</h2>
              <p className="text-sm text-foreground-secondary">All-time performance metrics</p>
            </div>
            <div className="flex items-center gap-2">
              <button className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amplifi-lime/10 text-amplifi-lime border border-amplifi-lime/20">
                All Time
              </button>
              <button className="px-3 py-1.5 text-xs font-medium rounded-lg text-foreground-secondary hover:bg-dark-elevated transition-colors">
                24h
              </button>
              <button className="px-3 py-1.5 text-xs font-medium rounded-lg text-foreground-secondary hover:bg-dark-elevated transition-colors">
                7d
              </button>
            </div>
          </div>

          <DataCard className="overflow-hidden p-0">
            <RankingTable>
              <RankingTableHeader>
                <RankingTableHead className="w-16">Rank</RankingTableHead>
                <RankingTableHead>Coin</RankingTableHead>
                <RankingTableHead align="right" sortable>Exposure Earned</RankingTableHead>
                <RankingTableHead align="right" sortable>Holder ROI</RankingTableHead>
                <RankingTableHead align="right" sortable>Team Payouts</RankingTableHead>
                <RankingTableHead align="right">Trend</RankingTableHead>
              </RankingTableHeader>
              <RankingTableBody>
                {globalRankings.map((coin) => (
                  <RankingTableRow key={coin.rank} highlight={coin.rank <= 3}>
                    <RankingTableCell>
                      <RankBadge rank={coin.rank} />
                    </RankingTableCell>
                    <RankingTableCell>
                      <div className="flex items-center gap-3">
                        {coin.imageUrl ? (
                          <img
                            src={coin.imageUrl}
                            alt={coin.name}
                            className="h-8 w-8 rounded-full object-cover"
                          />
                        ) : (
                          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-amplifi-purple to-amplifi-teal flex items-center justify-center text-white font-bold text-xs">
                            {coin.symbol.slice(0, 2)}
                          </div>
                        )}
                        <div>
                          <div className="font-medium text-white">{coin.name}</div>
                          <div className="text-xs text-foreground-secondary">${coin.symbol}</div>
                        </div>
                      </div>
                    </RankingTableCell>
                    <RankingTableCell align="right">
                      <span className="font-semibold text-white">{coin.exposure}</span>
                    </RankingTableCell>
                    <RankingTableCell align="right">
                      <span className="text-amplifi-lime font-medium">{coin.holderROI}%</span>
                    </RankingTableCell>
                    <RankingTableCell align="right">
                      <span className="text-white">{coin.teamPayouts}</span>
                    </RankingTableCell>
                    <RankingTableCell align="right">
                      <TrendIndicator value={coin.trend} />
                    </RankingTableCell>
                  </RankingTableRow>
                ))}
              </RankingTableBody>
            </RankingTable>
          </DataCard>
        </section>

        {/* Value Pillars */}
        <ValuePropsSection />

        {/* Explore Grid */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-6">Explore</h2>
          
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Link href="/campaigns" className="group">
              <DataCard className="h-full transition-all hover-shimmer">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amplifi-lime/20 to-amplifi-lime/5 mb-4">
                  <Star className="h-6 w-6 text-amplifi-lime" />
                </div>
                <h3 className="font-semibold text-white mb-1">Coins</h3>
                <p className="text-sm text-foreground-secondary">Browse all listed projects</p>
              </DataCard>
            </Link>

            <Link href="/holder" className="group">
              <DataCard className="h-full transition-all hover-shimmer">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amplifi-purple/20 to-amplifi-purple/5 mb-4">
                  <Users className="h-6 w-6 text-amplifi-purple" />
                </div>
                <h3 className="font-semibold text-white mb-1">Holders</h3>
                <p className="text-sm text-foreground-secondary">Top earning participants</p>
              </DataCard>
            </Link>

            <Link href="/campaigns" className="group">
              <DataCard className="h-full transition-all hover-shimmer">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amplifi-teal/20 to-amplifi-teal/5 mb-4">
                  <Award className="h-6 w-6 text-amplifi-teal" />
                </div>
                <h3 className="font-semibold text-white mb-1">Teams</h3>
                <p className="text-sm text-foreground-secondary">Project performance rankings</p>
              </DataCard>
            </Link>

            <Link href="/holder" className="group">
              <DataCard className="h-full transition-all hover-shimmer">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amplifi-orange/20 to-amplifi-orange/5 mb-4">
                  <BarChart3 className="h-6 w-6 text-amplifi-orange" />
                </div>
                <h3 className="font-semibold text-white mb-1">Dashboard</h3>
                <p className="text-sm text-foreground-secondary">Your personal analytics</p>
              </DataCard>
            </Link>
          </div>
        </section>

        {/* CTA Section */}
        <section className="text-center py-16 border-t border-dark-border/60">
          <h2 className="text-3xl font-bold text-white mb-4">
            Discover who really creates value
          </h2>
          <p className="text-foreground-secondary mb-8 max-w-xl mx-auto">
            Join thousands of holders earning rewards for organic engagement. 
            Connect your wallet to get started.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link
              href="/holder"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-amplifi-lime text-dark-bg font-semibold hover:bg-amplifi-lime-dark transition-colors"
            >
              Launch Dashboard
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/campaigns"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-dark-border text-white font-medium hover:bg-dark-elevated transition-colors"
            >
              Explore Campaigns
            </Link>
          </div>
        </section>

        {/* Mini Footer */}
        <MiniFooter />
      </div>
    </div>
  );
}

function MiniFooter() {
  const { resetAndOpenOnboarding } = useOnboarding();
  
  return (
    <footer className="py-8 border-t border-dark-border/40">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <p className="text-sm text-foreground-secondary">
          © {new Date().getFullYear()} AmpliFi. All rights reserved.
        </p>
        <div className="flex items-center gap-6">
          <Link href="/docs" className="text-sm text-foreground-secondary hover:text-white transition-colors">
            Docs
          </Link>
          <a
            href="https://x.com/AmpliFiSocial"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-foreground-secondary hover:text-white transition-colors"
          >
            @AmpliFiSocial
          </a>
          <button
            onClick={resetAndOpenOnboarding}
            className="flex items-center gap-1.5 text-sm text-foreground-secondary hover:text-white transition-colors"
          >
            <PlayCircle className="h-4 w-4" />
            Replay Intro
          </button>
        </div>
      </div>
    </footer>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search, TrendingUp, Users, Clock, ArrowRight, Zap, Twitter, Coins, Timer } from "lucide-react";
import { DataCard, DataCardHeader, MetricDisplay } from "@/app/components/ui/data-card";
import { cn } from "@/app/lib/utils";

interface Campaign {
  id: string;
  projectPubkey: string;
  tokenMint: string;
  name: string;
  description?: string;
  totalFeeLamports: string;
  rewardPoolLamports: string;
  startAtUnix: number;
  endAtUnix: number;
  minTokenBalance: string;
  trackingHandles: string[];
  trackingHashtags: string[];
  status: string;
}

function lamportsToSol(lamports: string): string {
  const value = BigInt(lamports);
  const sol = Number(value) / 1e9;
  return sol.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatTimeRemaining(endUnix: number): string {
  const now = Math.floor(Date.now() / 1000);
  const remaining = endUnix - now;
  
  if (remaining <= 0) return "Ended";
  
  const days = Math.floor(remaining / 86400);
  const hours = Math.floor((remaining % 86400) / 3600);
  
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h`;
  return "< 1h";
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const fetchCampaigns = async () => {
      try {
        const res = await fetch("/api/campaigns");
        const data = await res.json();
        if (data.campaigns) {
          setCampaigns(data.campaigns);
        }
      } catch (err) {
        console.error("Failed to fetch campaigns:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchCampaigns();
  }, []);

  const filteredCampaigns = campaigns.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.trackingHandles.some((h) => h.toLowerCase().includes(searchQuery.toLowerCase())) ||
    c.trackingHashtags.some((h) => h.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const totalRewardsLamports = campaigns.reduce((sum, c) => {
    const val = Number(c.rewardPoolLamports) || 0;
    return sum + val;
  }, 0);
  const totalRewards = (totalRewardsLamports / 1e9).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="min-h-screen bg-dark-bg py-12">
      <div className="mx-auto max-w-[1280px] px-6">
        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amplifi-lime/10">
              <Zap className="h-5 w-5 text-amplifi-lime" />
            </div>
            <h1 className="text-3xl font-bold text-white">
              Active Campaigns
            </h1>
          </div>
          <p className="text-foreground-secondary max-w-xl">
            Join campaigns to earn rewards for promoting projects. Your engagement score determines your share of the reward pool.
          </p>
        </div>

        {/* Search */}
        <div className="relative mb-8">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-foreground-secondary" />
          <input
            type="text"
            placeholder="Search campaigns by name, handle, or tag..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-12 pl-12 pr-4 rounded-xl border border-dark-border bg-dark-elevated text-white placeholder:text-foreground-secondary focus:outline-none focus:ring-2 focus:ring-amplifi-lime/20 focus:border-amplifi-lime transition-all"
          />
        </div>

        {/* Stats Bar */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
          <DataCard>
            <div className="flex items-center gap-4 p-5">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amplifi-lime/10">
                <TrendingUp className="h-6 w-6 text-amplifi-lime" />
              </div>
              <MetricDisplay 
                value={campaigns.length} 
                label="Active Campaigns" 
                accent="lime"
              />
            </div>
          </DataCard>
          <DataCard>
            <div className="flex items-center gap-4 p-5">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amplifi-purple/10">
                <Users className="h-6 w-6 text-amplifi-purple" />
              </div>
              <MetricDisplay 
                value={totalRewards} 
                label="Total Rewards" 
                suffix=" SOL"
                accent="purple"
              />
            </div>
          </DataCard>
          <DataCard>
            <div className="flex items-center gap-4 p-5">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amplifi-teal/10">
                <Clock className="h-6 w-6 text-amplifi-teal" />
              </div>
              <MetricDisplay 
                value="Daily" 
                label="Epoch Settlement" 
                accent="teal"
              />
            </div>
          </DataCard>
        </div>

        {/* Campaign List */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-amplifi-lime border-t-transparent"></div>
          </div>
        ) : filteredCampaigns.length === 0 ? (
          <DataCard className="py-16">
            <div className="flex flex-col items-center justify-center text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-dark-surface mb-4">
                <Search className="h-8 w-8 text-foreground-secondary" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">
                {searchQuery ? "No Campaigns Found" : "No Active Campaigns"}
              </h3>
              <p className="text-sm text-foreground-secondary max-w-sm">
                {searchQuery 
                  ? "Try adjusting your search terms."
                  : "Check back soon for new campaigns to join."}
              </p>
            </div>
          </DataCard>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredCampaigns.map((campaign) => (
              <CampaignCard key={campaign.id} campaign={campaign} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CampaignCard({ campaign }: { campaign: Campaign }) {
  const isActive = campaign.status === "active" && 
    Math.floor(Date.now() / 1000) < campaign.endAtUnix;
  
  const primaryHandle = campaign.trackingHandles[0]?.replace("@", "") || "";
  const twitterUrl = primaryHandle ? `https://x.com/${primaryHandle}` : null;

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-dark-border/40 bg-gradient-to-br from-dark-surface/90 to-dark-elevated/50 backdrop-blur-xl",
        "transition-all duration-500",
        "hover:border-amplifi-purple/30 hover:shadow-[0_8px_32px_rgba(139,92,246,0.15)]",
        "hover:scale-[1.02]"
      )}
    >
      {/* Fibonacci spiral gradient overlay - purple theme for campaigns */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(139,92,246,0.08)_0%,transparent_50%)] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(182,240,74,0.04)_0%,transparent_50%)]" />
      
      {/* Golden ratio grid layout */}
      <div className="relative p-1">
        {/* Top section - Campaign visual focal point */}
        <div className="relative aspect-[1.618/1] overflow-hidden rounded-xl bg-gradient-to-br from-dark-elevated to-dark-surface">
          {/* Background pattern - Fibonacci grid hint */}
          <div className="absolute inset-0 opacity-20">
            <div className="absolute top-0 left-0 w-3/5 h-3/5 border-r border-b border-amplifi-purple/20" />
            <div className="absolute top-0 right-0 w-2/5 h-2/5 border-b border-amplifi-purple/20" />
          </div>
          
          {/* Large campaign icon/symbol - Golden spiral focal point */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
            <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-amplifi-purple via-amplifi-teal to-amplifi-lime flex items-center justify-center text-white font-black text-2xl shadow-2xl border-2 border-white/10 group-hover:border-amplifi-purple/40 group-hover:shadow-[0_0_24px_rgba(139,92,246,0.3)] transition-all duration-500">
              {campaign.name.slice(0, 2).toUpperCase()}
            </div>
          </div>

          {/* Status badge - Top left (spiral start) */}
          <div className="absolute top-3 left-3">
            <div className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold backdrop-blur-md border",
              isActive 
                ? "bg-amplifi-lime/20 text-amplifi-lime border-amplifi-lime/30" 
                : "bg-dark-surface/80 text-foreground-secondary border-dark-border/50"
            )}>
              <div className={cn(
                "w-1.5 h-1.5 rounded-full",
                isActive ? "bg-amplifi-lime animate-pulse" : "bg-foreground-muted"
              )} />
              {isActive ? "Live" : "Ended"}
            </div>
          </div>

          {/* Twitter button - Top right (spiral continues clockwise) */}
          {twitterUrl && (
            <a
              href={twitterUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="absolute top-3 right-3 flex items-center justify-center h-8 w-8 rounded-lg bg-[#1DA1F2]/20 text-[#1DA1F2] border border-[#1DA1F2]/30 backdrop-blur-md hover:bg-[#1DA1F2]/30 hover:scale-110 transition-all duration-300 z-20"
            >
              <Twitter className="h-4 w-4" />
            </a>
          )}

          {/* Campaign name overlay - Bottom (spiral continues) */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-dark-bg/95 via-dark-bg/70 to-transparent p-4 pt-8">
            <h3 className="font-bold text-white text-lg tracking-tight truncate">{campaign.name}</h3>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {campaign.trackingHandles.slice(0, 2).map((handle) => (
                <span key={handle} className="text-xs px-2 py-0.5 rounded-full bg-amplifi-purple/20 text-amplifi-purple font-medium">
                  @{handle.replace("@", "")}
                </span>
              ))}
              {campaign.trackingHashtags.slice(0, 1).map((tag) => (
                <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-amplifi-teal/20 text-amplifi-teal font-medium">
                  {tag.trim().startsWith("$") ? tag : `#${tag.replace(/^#/, "")}`}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom section - Stats (Fibonacci: smaller squares) */}
        <div className="grid grid-cols-2 gap-1 mt-1">
          {/* Reward Pool - Bottom left */}
          <div className="bg-dark-elevated/50 rounded-xl p-3 group-hover:bg-dark-elevated/70 transition-colors">
            <div className="flex items-center gap-1.5 text-foreground-muted mb-1">
              <Coins className="h-3.5 w-3.5 text-amplifi-lime" />
              <span className="text-[10px] uppercase tracking-wider font-medium">Rewards</span>
            </div>
            <div className="text-lg font-black text-amplifi-lime">
              {lamportsToSol(campaign.rewardPoolLamports)}
              <span className="text-xs font-medium text-foreground-secondary ml-1">SOL</span>
            </div>
          </div>
          
          {/* Time Left - Bottom right */}
          <div className="bg-dark-elevated/50 rounded-xl p-3 group-hover:bg-dark-elevated/70 transition-colors">
            <div className="flex items-center gap-1.5 text-foreground-muted mb-1">
              <Timer className="h-3.5 w-3.5 text-amplifi-purple" />
              <span className="text-[10px] uppercase tracking-wider font-medium">Time Left</span>
            </div>
            <div className="text-lg font-black text-white">
              {formatTimeRemaining(campaign.endAtUnix)}
            </div>
          </div>
        </div>

        {/* View Campaign CTA */}
        <Link 
          href={`/campaigns/${campaign.id}`}
          className="flex items-center justify-between mt-1 p-3 rounded-xl bg-dark-elevated/30 group-hover:bg-amplifi-purple/10 transition-all"
        >
          <span className="text-sm font-medium text-foreground-secondary group-hover:text-amplifi-purple transition-colors">
            View Campaign
          </span>
          <ArrowRight className="h-4 w-4 text-foreground-secondary group-hover:text-amplifi-purple group-hover:translate-x-1 transition-all" />
        </Link>
      </div>
    </div>
  );
}

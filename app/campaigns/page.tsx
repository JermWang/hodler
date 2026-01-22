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
  imageUrl?: string | null;
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
      <div className="mx-auto max-w-[1280px] px-4 md:px-6">
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
            Join campaigns to earn rewards for promoting projects. Your engagement score determines your share of the reward pool. Verified X accounts only.
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
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
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
    <Link href={`/campaigns/${campaign.id}`} className="block">
      <div className="group relative overflow-hidden rounded-2xl border border-dark-border/40 bg-dark-surface/50 backdrop-blur-sm transition-all duration-300 hover:border-amplifi-purple/30 hover:shadow-[0_8px_32px_rgba(139,92,246,0.12)] hover:scale-[1.02]">
        {/* Large Image Area */}
        <div className="relative aspect-[4/3] overflow-hidden bg-dark-elevated">
          {campaign.imageUrl ? (
            <img
              src={campaign.imageUrl}
              alt={campaign.name}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-amplifi-purple/20 to-amplifi-teal/20">
              <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-amplifi-purple via-amplifi-teal to-amplifi-lime flex items-center justify-center text-white font-black text-xl">
                {campaign.name.slice(0, 2).toUpperCase()}
              </div>
            </div>
          )}
          
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-dark-bg via-dark-bg/30 to-transparent" />
          
          {/* Status badge - top left */}
          <div className={cn(
            "absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold backdrop-blur-md border",
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

          {/* Twitter button - top right */}
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

          {/* Campaign info overlay - bottom */}
          <div className="absolute bottom-0 left-0 right-0 p-4">
            <h3 className="text-base font-bold text-white truncate mb-1">{campaign.name}</h3>
            <div className="flex flex-wrap gap-1.5">
              {campaign.trackingHandles.slice(0, 2).map((handle) => (
                <span key={handle} className="text-xs px-2 py-0.5 rounded-full bg-amplifi-purple/30 text-amplifi-purple font-medium backdrop-blur-sm">
                  @{handle.replace("@", "")}
                </span>
              ))}
              {campaign.trackingHashtags.slice(0, 1).map((tag) => (
                <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-amplifi-teal/30 text-amplifi-teal font-medium backdrop-blur-sm">
                  {tag.trim().startsWith("$") ? tag : `#${tag.replace(/^#/, "")}`}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom stats bar */}
        <div className="p-2 border-t border-dark-border/40">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <Coins className="h-3.5 w-3.5 text-amplifi-lime" />
              <span className="text-sm font-bold text-amplifi-lime">{lamportsToSol(campaign.rewardPoolLamports)}</span>
              <span className="text-xs text-foreground-secondary">SOL</span>
            </div>
            <div className="flex items-center gap-1">
              <Timer className="h-3.5 w-3.5 text-foreground-secondary" />
              <span className="text-xs font-medium text-white">{formatTimeRemaining(campaign.endAtUnix)}</span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

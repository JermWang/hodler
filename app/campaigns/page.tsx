"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search, TrendingUp, Users, Clock, ArrowRight, Zap } from "lucide-react";
import { DataCard, DataCardHeader, MetricDisplay } from "@/app/components/ui/data-card";

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

  const totalRewards = lamportsToSol(
    campaigns.reduce((sum, c) => sum + BigInt(c.rewardPoolLamports), 0n).toString()
  );

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
            placeholder="Search campaigns by name, handle, or hashtag..."
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

  return (
    <Link href={`/campaigns/${campaign.id}`}>
      <DataCard className="group h-full hover-shimmer transition-all cursor-pointer">
        <div className="p-5">
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-white truncate group-hover:text-amplifi-lime transition-colors">
                {campaign.name}
              </h3>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {campaign.trackingHandles.slice(0, 2).map((handle) => (
                  <span key={handle} className="text-xs px-2 py-0.5 rounded-full bg-dark-surface text-foreground-secondary">
                    @{handle.replace("@", "")}
                  </span>
                ))}
                {campaign.trackingHashtags.slice(0, 1).map((tag) => (
                  <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-dark-surface text-foreground-secondary">
                    #{tag.replace("#", "")}
                  </span>
                ))}
              </div>
            </div>
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
              isActive 
                ? "bg-amplifi-lime/10 text-amplifi-lime" 
                : "bg-dark-surface text-foreground-secondary"
            }`}>
              {isActive ? "Active" : "Ended"}
            </span>
          </div>

          {/* Description */}
          {campaign.description && (
            <p className="text-sm text-foreground-secondary mb-4 line-clamp-2">
              {campaign.description}
            </p>
          )}
          
          {/* Stats */}
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-dark-border">
            <div>
              <div className="text-lg font-bold text-amplifi-lime">
                {lamportsToSol(campaign.rewardPoolLamports)} SOL
              </div>
              <div className="text-xs text-foreground-secondary">Reward Pool</div>
            </div>
            <div>
              <div className="text-lg font-bold text-white">
                {formatTimeRemaining(campaign.endAtUnix)}
              </div>
              <div className="text-xs text-foreground-secondary">Time Left</div>
            </div>
          </div>

          {/* CTA */}
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-foreground-secondary group-hover:text-amplifi-lime transition-colors">
              View Campaign
            </span>
            <ArrowRight className="h-4 w-4 text-foreground-secondary group-hover:text-amplifi-lime group-hover:translate-x-1 transition-all" />
          </div>
        </div>
      </DataCard>
    </Link>
  );
}

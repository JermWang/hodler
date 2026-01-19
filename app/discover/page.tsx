"use client";

import { useEffect, useMemo, useState } from "react";
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

interface ProjectProfile {
  tokenMint: string;
  name?: string | null;
  symbol?: string | null;
  description?: string | null;
  websiteUrl?: string | null;
  xUrl?: string | null;
  telegramUrl?: string | null;
  discordUrl?: string | null;
  imageUrl?: string | null;
  bannerUrl?: string | null;
  metadataUri?: string | null;
  createdByWallet?: string | null;
  createdAtUnix: number;
  updatedAtUnix: number;
}

function lamportsToSol(lamports: string): string {
  try {
    const value = BigInt(lamports);
    const sol = Number(value) / 1e9;
    return sol.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  } catch {
    return "0.00";
  }
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

export default function DiscoverPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProjectProfile>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    let canceled = false;

    const run = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/campaigns");
        const data = await res.json();
        const list: Campaign[] = Array.isArray(data?.campaigns) ? data.campaigns : [];
        if (!canceled) setCampaigns(list);

        const tokenMints = Array.from(new Set(list.map((c) => String(c.tokenMint ?? "").trim()).filter(Boolean)));
        if (tokenMints.length > 0) {
          const pRes = await fetch("/api/projects/batch", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ tokenMints }),
          });
          const pData = await pRes.json();
          const rows: ProjectProfile[] = Array.isArray(pData?.projects) ? pData.projects : [];
          const next: Record<string, ProjectProfile> = {};
          for (const row of rows) {
            const mint = String(row?.tokenMint ?? "").trim();
            if (mint) next[mint] = row;
          }
          if (!canceled) setProfiles(next);
        }
      } catch (e) {
        console.error("Failed to load discover data", e);
        if (!canceled) {
          setCampaigns([]);
          setProfiles({});
        }
      } finally {
        if (!canceled) setLoading(false);
      }
    };

    run();
    return () => {
      canceled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return campaigns;

    return campaigns.filter((c) => {
      const name = String(c.name ?? "").toLowerCase();
      const mint = String(c.tokenMint ?? "").toLowerCase();
      const handles = Array.isArray(c.trackingHandles) ? c.trackingHandles.join(" ").toLowerCase() : "";
      const tags = Array.isArray(c.trackingHashtags) ? c.trackingHashtags.join(" ").toLowerCase() : "";
      return name.includes(q) || mint.includes(q) || handles.includes(q) || tags.includes(q);
    });
  }, [campaigns, searchQuery]);

  const totalRewardsSol = useMemo(() => {
    const total = campaigns.reduce((sum, c) => {
      try {
        return sum + BigInt(c.rewardPoolLamports);
      } catch {
        return sum;
      }
    }, 0n);
    return lamportsToSol(total.toString());
  }, [campaigns]);

  return (
    <div className="min-h-screen bg-dark-bg">
      <section className="relative overflow-hidden border-b border-dark-border">
        <div className="absolute inset-0 bg-gradient-to-br from-amplifi-purple/10 via-dark-bg to-amplifi-lime/5" />
        <div className="relative mx-auto max-w-[1280px] px-6 pt-24 pb-12">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amplifi-lime/10 border border-amplifi-lime/20 text-amplifi-lime text-sm font-medium mb-6">
              <Zap className="h-4 w-4" />
              Live Campaign Discovery
            </div>

            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight">Discover campaigns</h1>
            <p className="text-lg text-foreground-secondary mb-8 max-w-2xl">
              Find active campaigns, see the reward pools, and join to earn by promoting projects.
            </p>

            <div className="relative max-w-xl">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-foreground-muted" />
              <input
                type="text"
                placeholder="Search campaigns, mints, handles, hashtags..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-14 pl-12 pr-4 rounded-xl border border-dark-border bg-dark-surface text-white placeholder:text-foreground-muted focus:outline-none focus:ring-2 focus:ring-amplifi-lime/30 focus:border-amplifi-lime/50 transition-all"
              />
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1280px] px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
          <DataCard>
            <div className="flex items-center gap-4 p-5">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amplifi-lime/10">
                <TrendingUp className="h-6 w-6 text-amplifi-lime" />
              </div>
              <MetricDisplay value={campaigns.length} label="Active campaigns" accent="lime" />
            </div>
          </DataCard>
          <DataCard>
            <div className="flex items-center gap-4 p-5">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amplifi-purple/10">
                <Users className="h-6 w-6 text-amplifi-purple" />
              </div>
              <MetricDisplay value={totalRewardsSol} label="Total rewards" suffix=" SOL" accent="purple" />
            </div>
          </DataCard>
          <DataCard>
            <div className="flex items-center gap-4 p-5">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amplifi-teal/10">
                <Clock className="h-6 w-6 text-amplifi-teal" />
              </div>
              <MetricDisplay value="Daily" label="Epoch settlement" accent="teal" />
            </div>
          </DataCard>
        </div>

        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-white">Active campaigns</h2>
            <p className="text-sm text-foreground-secondary">Join campaigns and earn rewards for engagement</p>
          </div>
          <Link href="/campaigns" className="flex items-center gap-2 text-sm text-amplifi-lime hover:text-amplifi-lime-dark transition-colors">
            View all <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-amplifi-lime border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <DataCard className="py-16">
            <div className="flex flex-col items-center justify-center text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-dark-surface mb-4">
                <Search className="h-8 w-8 text-foreground-secondary" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">{searchQuery ? "No results" : "No active campaigns"}</h3>
              <p className="text-sm text-foreground-secondary max-w-sm">{searchQuery ? "Try a different search." : "Check back soon."}</p>
            </div>
          </DataCard>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((campaign) => (
              <CampaignPreviewCard key={campaign.id} campaign={campaign} profile={profiles[campaign.tokenMint]} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CampaignPreviewCard({ campaign, profile }: { campaign: Campaign; profile?: ProjectProfile }) {
  const isActive = campaign.status === "active" && Math.floor(Date.now() / 1000) < campaign.endAtUnix;
  const title = profile?.name || campaign.name;
  const symbol = profile?.symbol || "";

  return (
    <Link href={`/campaigns/${campaign.id}`}>
      <DataCard className="group h-full hover:border-amplifi-lime/30 transition-all cursor-pointer">
        <div className="p-5">
          <DataCardHeader
            title={title}
            subtitle={symbol ? `$${symbol}` : undefined}
            action={
              <span
                className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                  isActive ? "bg-amplifi-lime/10 text-amplifi-lime" : "bg-dark-surface text-foreground-secondary"
                }`}
              >
                {isActive ? "Active" : "Ended"}
              </span>
            }
            className="mb-3"
          />

          {profile?.description || campaign.description ? (
            <p className="text-sm text-foreground-secondary mb-4">{profile?.description || campaign.description}</p>
          ) : null}

          <div className="flex flex-wrap gap-1.5 mb-4">
            {(campaign.trackingHandles || []).slice(0, 2).map((handle) => (
              <span key={handle} className="text-xs px-2 py-0.5 rounded-full bg-dark-surface text-foreground-secondary">
                @{handle.replace("@", "")}
              </span>
            ))}
            {(campaign.trackingHashtags || []).slice(0, 1).map((tag) => (
              <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-dark-surface text-foreground-secondary">
                #{tag.replace("#", "")}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-dark-border">
            <div>
              <div className="text-lg font-bold text-amplifi-lime">{lamportsToSol(campaign.rewardPoolLamports)} SOL</div>
              <div className="text-xs text-foreground-secondary">Reward Pool</div>
            </div>
            <div>
              <div className="text-lg font-bold text-white">{formatTimeRemaining(campaign.endAtUnix)}</div>
              <div className="text-xs text-foreground-secondary">Time Left</div>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-foreground-secondary group-hover:text-amplifi-lime transition-colors">View campaign</span>
            <ArrowRight className="h-4 w-4 text-foreground-secondary group-hover:text-amplifi-lime group-hover:translate-x-1 transition-all" />
          </div>
        </div>
      </DataCard>
    </Link>
  );
}

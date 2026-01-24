"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, TrendingUp, Users, Clock, Zap, Twitter, Coins, Timer, AlertCircle } from "lucide-react";
import { DataCard, MetricDisplay } from "@/app/components/ui/data-card";
import { Button } from "@/app/components/ui/button";
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

type LoadError = {
  message: string;
  traceId?: string | null;
};

function EndedCampaignRow({ campaign }: { campaign: Campaign }) {
  const rawName = String(campaign.name ?? "").trim();
  const baseName = rawName.replace(/\s+engagement\s+campaign\s*$/i, "").trim() || rawName;
  const initials = baseName.slice(0, 2).toUpperCase();
  const primaryHandle = campaign.trackingHandles[0]?.replace("@", "") || "";
  const primaryTag = campaign.trackingHashtags[0]?.replace(/^#/, "") || "";
  const endLabel = formatDateLabel(campaign.endAtUnix);

  return (
    <Link href={`/campaigns/${campaign.id}`} className="block">
      <DataCard className="p-4" variant="elevated" hover={false}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-dark-elevated">
              {campaign.imageUrl ? (
                <img
                  src={campaign.imageUrl}
                  alt={campaign.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-amplifi-purple/20 to-amplifi-teal/20 text-white text-xs font-black">
                  {initials}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-white truncate max-w-[260px]">{baseName}</h3>
                <span className="text-xs text-foreground-secondary">Ended {endLabel}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-foreground-secondary">
                {primaryHandle && <span>@{primaryHandle}</span>}
                {primaryTag && <span>#{primaryTag}</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Coins className="h-3.5 w-3.5 text-amplifi-lime" />
            <span className="text-sm font-semibold text-amplifi-lime">{lamportsToSol(campaign.rewardPoolLamports)}</span>
            <span className="text-xs text-foreground-secondary">SOL</span>
          </div>
        </div>
      </DataCard>
    </Link>
  );
}

function PendingCampaignRow({ campaign }: { campaign: Campaign }) {
  const rawName = String(campaign.name ?? "").trim();
  const baseName = rawName.replace(/\s+engagement\s+campaign\s*$/i, "").trim() || rawName;
  const initials = baseName.slice(0, 2).toUpperCase();
  const primaryHandle = campaign.trackingHandles[0]?.replace("@", "") || "";
  const primaryTag = campaign.trackingHashtags[0]?.replace(/^#/, "") || "";
  const startLabel = formatDateLabel(campaign.startAtUnix);

  return (
    <Link href={`/campaigns/${campaign.id}`} className="block">
      <DataCard className="p-4 border border-amplifi-yellow/15" variant="elevated" hover={false}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-dark-elevated">
              {campaign.imageUrl ? (
                <img
                  src={campaign.imageUrl}
                  alt={campaign.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-amplifi-purple/20 to-amplifi-teal/20 text-white text-xs font-black">
                  {initials}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-white truncate max-w-[260px]">{baseName}</h3>
                <span className="text-xs font-semibold text-amplifi-yellow bg-amplifi-yellow/10 border border-amplifi-yellow/20 px-2 py-0.5 rounded-full">
                  Funding pending
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-foreground-secondary">
                {primaryHandle && <span>@{primaryHandle}</span>}
                {primaryTag && <span>#{primaryTag}</span>}
                <span>Starts {startLabel}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Coins className="h-3.5 w-3.5 text-amplifi-lime" />
            <span className="text-sm font-semibold text-amplifi-lime">{lamportsToSol(campaign.rewardPoolLamports)}</span>
            <span className="text-xs text-foreground-secondary">SOL</span>
          </div>
        </div>
      </DataCard>
    </Link>
  );
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

function formatDateLabel(unix: number): string {
  return new Date(unix * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function CampaignCardSkeleton() {
  return (
    <div className="rounded-2xl border border-dark-border/40 bg-dark-surface/50 overflow-hidden">
      <div className="aspect-[4/3] skeleton" />
      <div className="p-3 space-y-2">
        <div className="skeleton skeletonLine w-3/4" />
        <div className="skeleton skeletonLine skeletonLineSm w-1/2" />
        <div className="flex gap-2">
          <div className="skeleton skeletonLineSm w-16" />
          <div className="skeleton skeletonLineSm w-12" />
        </div>
      </div>
      <div className="p-2 border-t border-dark-border/40">
        <div className="flex items-center justify-between">
          <div className="skeleton skeletonLineSm w-20" />
          <div className="skeleton skeletonLineSm w-16" />
        </div>
      </div>
    </div>
  );
}

function CampaignRowSkeleton({ accent }: { accent?: "lime" | "yellow" | "muted" }) {
  const accentClass = accent === "yellow"
    ? "border-amplifi-yellow/10"
    : accent === "lime"
      ? "border-amplifi-lime/10"
      : "border-dark-border/40";
  return (
    <DataCard className={cn("p-4", accentClass)} variant="elevated" hover={false}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="skeleton h-12 w-12 rounded-xl" />
          <div className="flex-1 space-y-2">
            <div className="skeleton skeletonLine w-40" />
            <div className="flex gap-2">
              <div className="skeleton skeletonLineSm w-16" />
              <div className="skeleton skeletonLineSm w-12" />
            </div>
          </div>
        </div>
        <div className="skeleton skeletonLineSm w-16" />
      </div>
    </DataCard>
  );
}

const ENDED_PAGE_SIZE = 8;

export default function CampaignsPage() {
  const [activeCampaigns, setActiveCampaigns] = useState<Campaign[]>([]);
  const [pendingCampaigns, setPendingCampaigns] = useState<Campaign[]>([]);
  const [endedCampaigns, setEndedCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [endedVisibleCount, setEndedVisibleCount] = useState(ENDED_PAGE_SIZE);
  const [loadError, setLoadError] = useState<LoadError | null>(null);

  const skeletonCards = useMemo(() => Array.from({ length: 8 }, (_, idx) => <CampaignCardSkeleton key={idx} />), []);
  const skeletonRows = useMemo(() => Array.from({ length: 3 }, (_, idx) => <CampaignRowSkeleton key={idx} />), []);

  useEffect(() => {
    const fetchCampaigns = async () => {
      try {
        setLoadError(null);
        const [activeRes, pendingRes, endedRes] = await Promise.all([
          fetch("/api/campaigns?status=active"),
          fetch("/api/campaigns?status=pending"),
          fetch("/api/campaigns?status=ended"),
        ]);
        const readJsonSafe = async (res: Response) => await res.json().catch(() => null);
        const [activeData, pendingData, endedData] = await Promise.all([
          readJsonSafe(activeRes),
          readJsonSafe(pendingRes),
          readJsonSafe(endedRes),
        ]);

        const traceFrom = (res: Response, data: any) => res.headers.get("x-trace-id") ?? data?.traceId ?? null;
        const failures: string[] = [];
        if (!activeRes.ok) failures.push("active");
        if (!pendingRes.ok) failures.push("pending");
        if (!endedRes.ok) failures.push("ended");
        if (failures.length) {
          const traceId = traceFrom(activeRes, activeData) || traceFrom(pendingRes, pendingData) || traceFrom(endedRes, endedData);
          setLoadError({
            message: `Failed to load ${failures.join(", ")} campaigns. Please retry shortly.`,
            traceId,
          });
        }

        if (activeRes.ok && activeData?.campaigns) {
          setActiveCampaigns(activeData.campaigns);
        }
        if (pendingRes.ok && pendingData?.campaigns) {
          setPendingCampaigns(pendingData.campaigns);
        }
        if (endedRes.ok && endedData?.campaigns) {
          setEndedCampaigns(endedData.campaigns);
        }
      } catch (err) {
        console.error("Failed to fetch campaigns:", err);
        setLoadError({ message: "Failed to load campaigns. Please retry.", traceId: null });
      } finally {
        setLoading(false);
      }
    };

    fetchCampaigns();
  }, []);

  useEffect(() => {
    setEndedVisibleCount(ENDED_PAGE_SIZE);
  }, [searchQuery, endedCampaigns.length]);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const matchesSearch = (c: Campaign) =>
    !normalizedQuery ||
    c.name.toLowerCase().includes(normalizedQuery) ||
    c.trackingHandles.some((h) => h.toLowerCase().includes(normalizedQuery)) ||
    c.trackingHashtags.some((h) => h.toLowerCase().includes(normalizedQuery));

  const filteredActiveCampaigns = activeCampaigns.filter(matchesSearch);
  const filteredPendingCampaigns = pendingCampaigns.filter(matchesSearch);
  const filteredEndedCampaigns = endedCampaigns.filter(matchesSearch);
  const visibleEndedCampaigns = filteredEndedCampaigns.slice(0, endedVisibleCount);
  const hasMoreEnded = filteredEndedCampaigns.length > endedVisibleCount;
  const canCollapseEnded = endedVisibleCount > ENDED_PAGE_SIZE;

  const totalRewardsLamports = activeCampaigns.reduce((sum, c) => {
    const val = Number(c.rewardPoolLamports) || 0;
    return sum + val;
  }, 0);
  const totalRewards = loading
    ? "—"
    : (totalRewardsLamports / 1e9).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const activeCampaignCount = loading ? "—" : activeCampaigns.length;

  return (
    <div className="min-h-screen bg-dark-bg py-12 relative overflow-hidden">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[420px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(182,240,74,0.18)_0%,rgba(31,75,255,0.06)_45%,rgba(11,12,14,0)_70%)] blur-3xl" />
      <div className="relative mx-auto max-w-[1280px] px-4 md:px-6">
        {/* Header */}
        <div className="mb-10 animate-fade-up">
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

        {loadError && (
          <DataCard className="mb-8 border-red-500/20 bg-red-500/5" hover={false}>
            <div className="flex flex-col gap-2 p-4">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-red-400" />
                <p className="text-sm text-red-200">{loadError.message}</p>
              </div>
              {loadError.traceId && (
                <div className="text-xs text-red-200/80">
                  Trace ID: <span className="font-mono text-red-100">{loadError.traceId}</span>
                </div>
              )}
            </div>
          </DataCard>
        )}

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
                value={activeCampaignCount} 
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
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {skeletonCards}
          </div>
        ) : filteredActiveCampaigns.length === 0 ? (
          <DataCard className="py-16">
            <div className="flex flex-col items-center justify-center text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-dark-surface mb-4">
                <Search className="h-8 w-8 text-foreground-secondary" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">
                {searchQuery ? "No Active Campaigns Found" : "No Active Campaigns"}
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
            {filteredActiveCampaigns.map((campaign) => (
              <CampaignCard key={campaign.id} campaign={campaign} />
            ))}
          </div>
        )}

        {/* Funding Pending */}
        <div className="mt-12">
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amplifi-yellow/10 border border-amplifi-yellow/20">
                <AlertCircle className="h-4.5 w-4.5 text-amplifi-yellow" />
              </div>
              <h2 className="text-2xl font-bold text-white">Funding Pending</h2>
            </div>
            <p className="text-foreground-secondary max-w-xl">
              These campaigns are waiting for escrow funding confirmation before they go live.
            </p>
          </div>

          {loading ? (
            <div className="space-y-3">
              {skeletonRows.map((row, idx) => (
                <div key={`pending-skeleton-${idx}`}>{row}</div>
              ))}
            </div>
          ) : filteredPendingCampaigns.length === 0 ? (
            <DataCard className="py-14">
              <div className="flex flex-col items-center justify-center text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-dark-surface mb-4">
                  <AlertCircle className="h-8 w-8 text-foreground-secondary" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">No Funding Pending</h3>
                <p className="text-sm text-foreground-secondary max-w-sm">
                  Campaigns awaiting escrow funding will appear here.
                </p>
              </div>
            </DataCard>
          ) : (
            <div className="space-y-3">
              {filteredPendingCampaigns.map((campaign) => (
                <PendingCampaignRow key={campaign.id} campaign={campaign} />
              ))}
            </div>
          )}
        </div>

        {/* Ended Campaigns */}
        <div className="mt-14">
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-dark-surface">
                <Clock className="h-4.5 w-4.5 text-foreground-secondary" />
              </div>
              <h2 className="text-2xl font-bold text-white">Ended Campaigns</h2>
            </div>
            <p className="text-foreground-secondary max-w-xl">
              Browse past campaigns and review their reward pools.
            </p>
          </div>

          {loading ? (
            <div className="space-y-3">
              {skeletonRows.map((row, idx) => (
                <div key={`ended-skeleton-${idx}`}>{row}</div>
              ))}
            </div>
          ) : filteredEndedCampaigns.length === 0 ? (
            <DataCard className="py-14">
              <div className="flex flex-col items-center justify-center text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-dark-surface mb-4">
                  <Clock className="h-8 w-8 text-foreground-secondary" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">
                  {searchQuery ? "No Ended Campaigns Found" : "No Ended Campaigns"}
                </h3>
                <p className="text-sm text-foreground-secondary max-w-sm">
                  {searchQuery
                    ? "Try adjusting your search terms."
                    : "Past campaigns will show up here once they finish."}
                </p>
              </div>
            </DataCard>
          ) : (
            <div className="space-y-3">
              {visibleEndedCampaigns.map((campaign) => (
                <EndedCampaignRow key={campaign.id} campaign={campaign} />
              ))}
            </div>
          )}

          {(hasMoreEnded || canCollapseEnded) && (
            <div className="mt-4 flex items-center justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (hasMoreEnded) {
                    setEndedVisibleCount((count) => Math.min(count + ENDED_PAGE_SIZE, filteredEndedCampaigns.length));
                  } else {
                    setEndedVisibleCount(ENDED_PAGE_SIZE);
                  }
                }}
              >
                {hasMoreEnded ? "Show more ended campaigns" : "Show fewer ended campaigns"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CampaignCard({ campaign }: { campaign: Campaign }) {
  const nowUnix = Math.floor(Date.now() / 1000);
  const hasEnded = nowUnix >= campaign.endAtUnix;
  const isPending = campaign.status === "pending";
  const isActive = campaign.status === "active" && !hasEnded;
  const statusLabel = isPending ? "Funding pending" : isActive ? "Live" : "Ended";
  const statusBadgeClass = isPending
    ? "bg-amplifi-yellow/10 text-amplifi-yellow border-amplifi-yellow/30"
    : isActive
      ? "bg-amplifi-lime/20 text-amplifi-lime border-amplifi-lime/30"
      : "bg-dark-surface/80 text-foreground-secondary border-dark-border/50";
  const statusDotClass = isPending
    ? "bg-amplifi-yellow"
    : isActive
      ? "bg-amplifi-lime animate-pulse"
      : "bg-foreground-muted";

  const rawName = String(campaign.name ?? "").trim();
  const baseName = rawName.replace(/\s+engagement\s+campaign\s*$/i, "").trim() || rawName;
  
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
            statusBadgeClass
          )}>
            <div className={cn("w-1.5 h-1.5 rounded-full", statusDotClass)} />
            {statusLabel}
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
            <h3 className="text-base font-bold text-white truncate mb-0.5">{baseName}</h3>
            <div className="text-xs text-foreground-secondary mb-1">Engagement campaign</div>
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

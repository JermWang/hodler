"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import Link from "next/link";
import bs58 from "bs58";
import { ArrowLeft, Clock, Users, TrendingUp, Twitter, CheckCircle, AlertCircle, Target, RotateCw } from "lucide-react";
import { DataCard, MetricDisplay } from "@/app/components/ui/data-card";
import { EpochProgress, FeeSplitBar, EngagementPointsLegend } from "@/app/components/ui/amplifi-components";

interface Campaign {
  id: string;
  projectPubkey: string;
  tokenMint: string;
  name: string;
  description?: string;
  totalFeeLamports: string;
  platformFeeLamports: string;
  rewardPoolLamports: string;
  startAtUnix: number;
  endAtUnix: number;
  epochDurationSeconds: number;
  minTokenBalance: string;
  weightLikeBps: number;
  weightRetweetBps: number;
  weightReplyBps: number;
  weightQuoteBps: number;
  trackingHandles: string[];
  trackingHashtags: string[];
  trackingUrls: string[];
  status: string;
  isManualLockup: boolean;
}

interface Epoch {
  id: string;
  epochNumber: number;
  startAtUnix: number;
  endAtUnix: number;
  rewardPoolLamports: string;
  status: string;
}

interface CampaignStats {
  participantCount: number;
  uniqueEngagers: number;
  totalEngagements: number;
  totalScore: number;
}

type ActionError = {
  message: string;
  traceId?: string | null;
};

function lamportsToSol(lamports: string): string {
  const value = BigInt(lamports);
  const sol = Number(value) / 1e9;
  return sol.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
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

function formatEpochDuration(seconds: number): string {
  if (seconds >= 86400) return `${Math.floor(seconds / 86400)} day(s)`;
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)} hour(s)`;
  return `${Math.floor(seconds / 60)} minute(s)`;
}

function formatCooldown(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  if (safeSeconds <= 0) return "0s";
  const mins = Math.floor(safeSeconds / 60);
  const secs = safeSeconds % 60;
  if (mins <= 0) return `${secs}s`;
  return `${mins}m ${secs.toString().padStart(2, "0")}s`;
}

function CampaignDetailSkeleton() {
  return (
    <div className="min-h-screen bg-dark-bg py-12">
      <div className="mx-auto max-w-[1280px] px-6">
        <div className="skeleton skeletonLine w-32 mb-8" />
        <div className="mb-8 space-y-4">
          <div className="skeleton skeletonLine w-64 h-6" />
          <div className="skeleton skeletonLine w-80" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={`stat-skeleton-${idx}`} className="rounded-2xl border border-dark-border/60 bg-dark-surface/70 p-5">
              <div className="skeleton skeletonLine w-20" />
              <div className="skeleton skeletonLine skeletonLineSm w-24 mt-3" />
            </div>
          ))}
        </div>
        <div className="grid lg:grid-cols-2 gap-6 mb-8">
          {Array.from({ length: 2 }).map((_, idx) => (
            <div key={`panel-skeleton-${idx}`} className="rounded-2xl border border-dark-border/60 bg-dark-surface/70 p-5">
              <div className="skeleton skeletonLine w-32" />
              <div className="skeleton skeletonLine skeletonLineSm w-40 mt-4" />
              <div className="skeleton skeletonLine skeletonLineSm w-24 mt-2" />
            </div>
          ))}
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div key={`card-skeleton-${idx}`} className="rounded-2xl border border-dark-border/60 bg-dark-surface/70 p-5">
              <div className="skeleton skeletonLine w-32" />
              <div className="skeleton skeletonLine skeletonLineSm w-48 mt-4" />
              <div className="skeleton skeletonLine skeletonLineSm w-36 mt-2" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function CampaignPage() {
  const params = useParams();
  const campaignId = params?.id as string;
  const { publicKey, connected, signMessage } = useWallet();

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [currentEpoch, setCurrentEpoch] = useState<Epoch | null>(null);
  const [stats, setStats] = useState<CampaignStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<
    | {
        windowDays: number;
        tweetsFound: number;
        tweetsConsidered: number;
        alreadyRecorded: number;
        engagementsRecorded: number;
        message?: string | null;
        usedCursor?: boolean;
        startTime?: string | null;
        query?: string | null;
      }
    | null
  >(null);
  const [error, setError] = useState<ActionError | null>(null);
  const [scanCooldownSeconds, setScanCooldownSeconds] = useState(0);

  const scanCooldownLabel = scanCooldownSeconds > 0 ? `Next scan available in ${formatCooldown(scanCooldownSeconds)}` : null;
  const canScan = scanCooldownSeconds <= 0;

  useEffect(() => {
    if (!campaignId) return;
    const fetchCampaign = async () => {
      try {
        setError(null);
        const res = await fetch(`/api/campaigns/${campaignId}`);
        const data = await res.json().catch(() => null);
        const traceId = res.headers.get("x-trace-id") ?? data?.traceId ?? null;
        if (!res.ok) {
          setError({ message: data?.error || "Failed to load campaign", traceId });
          return;
        }
        if (data?.campaign) setCampaign(data.campaign);
        if (data?.currentEpoch) setCurrentEpoch(data.currentEpoch);
        if (data?.stats) setStats(data.stats);
      } catch (err) {
        console.error("Failed to fetch campaign:", err);
        setError({ message: "Failed to load campaign", traceId: null });
      } finally {
        setLoading(false);
      }
    };
    fetchCampaign();
  }, [campaignId]);

  useEffect(() => {
    setScanResult(null);
  }, [campaignId]);

  useEffect(() => {
    const run = async () => {
      if (!campaignId) return;
      if (!connected || !publicKey) {
        setJoined(false);
        return;
      }
      try {
        const sp = new URLSearchParams();
        sp.set("walletPubkey", publicKey.toBase58());
        const res = await fetch(`/api/campaigns/${campaignId}/participant?${sp.toString()}`, {
          cache: "no-store",
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) return;
        setJoined(Boolean(json?.joined));
      } catch {
      }
    };

    run();
  }, [campaignId, connected, publicKey]);

  useEffect(() => {
    if (scanCooldownSeconds <= 0) return;
    const interval = window.setInterval(() => {
      setScanCooldownSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [scanCooldownSeconds]);

  const handleJoinCampaign = async () => {
    if (!campaign) {
      setError({ message: "Campaign not loaded yet", traceId: null });
      return;
    }
    if (!publicKey) {
      setError({ message: "Connect a wallet to join this campaign", traceId: null });
      return;
    }
    if (!signMessage) {
      setError({ message: "This wallet does not support message signing. Try another wallet to join.", traceId: null });
      return;
    }
    setJoining(true);
    setError(null);
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const msg = `AmpliFi\nJoin Campaign\nCampaign: ${campaignId}\nWallet: ${publicKey.toBase58()}\nTimestamp: ${timestamp}`;
      const sigBytes = await signMessage(new TextEncoder().encode(msg));
      const signature = bs58.encode(sigBytes);
      const res = await fetch(`/api/campaigns/${campaignId}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletPubkey: publicKey.toBase58(),
          signature,
          timestamp,
        }),
      });
      const data = await res.json().catch(() => null);
      const traceId = res.headers.get("x-trace-id") ?? data?.traceId ?? null;
      if (!res.ok) {
        setError({ message: data?.error || "Failed to join campaign", traceId });
        return;
      }
      setJoined(true);
    } catch (err) {
      console.error("Failed to join campaign:", err);
      setError({ message: "Failed to join campaign", traceId: null });
    } finally {
      setJoining(false);
    }
  };

  const handleScanRecentTweets = async (opts?: { forceWindow?: boolean }) => {
    if (!campaign) {
      setError({ message: "Campaign not loaded yet", traceId: null });
      return;
    }
    if (!publicKey) {
      setError({ message: "Connect a wallet to scan tweets", traceId: null });
      return;
    }
    if (!signMessage) {
      setError({ message: "This wallet does not support message signing. Try another wallet to scan.", traceId: null });
      return;
    }
    if (!canScan) {
      setError({ message: `Please wait ${formatCooldown(scanCooldownSeconds)} before scanning again.`, traceId: null });
      return;
    }
    setScanning(true);
    setError(null);
    setScanResult(null);
    try {
      const timestampUnix = Math.floor(Date.now() / 1000);
      const msg = `AmpliFi\nScan Campaign Tweets\nCampaign: ${campaignId}\nWallet: ${publicKey.toBase58()}\nTimestamp: ${timestampUnix}`;
      const sigBytes = await signMessage(new TextEncoder().encode(msg));
      const signature = bs58.encode(sigBytes);

      const res = await fetch(`/api/campaigns/${campaignId}/scan-recent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletPubkey: publicKey.toBase58(),
          signature,
          timestampUnix,
          windowDays: 7,
          forceWindow: opts?.forceWindow === true,
        }),
      });
      const data = await res.json().catch(() => null);
      const traceId = res.headers.get("x-trace-id") ?? data?.traceId ?? null;
      const retryAfterHeader = res.headers.get("retry-after");
      const retryAfterSeconds = Number(data?.retryAfterSeconds ?? data?.retryAfter ?? retryAfterHeader ?? 0) || 0;
      if (retryAfterSeconds > 0) {
        setScanCooldownSeconds(retryAfterSeconds);
      }
      if (!res.ok) {
        setError({ message: String(data?.error || "Failed to scan tweets"), traceId });
        return;
      }

      setScanResult({
        windowDays: Number(data?.windowDays || 7),
        tweetsFound: Number(data?.tweetsFound || 0),
        tweetsConsidered: Number(data?.tweetsConsidered || 0),
        alreadyRecorded: Number(data?.alreadyRecorded || 0),
        engagementsRecorded: Number(data?.engagementsRecorded || 0),
        message: typeof data?.message === "string" ? data.message : null,
        usedCursor: typeof data?.usedCursor === "boolean" ? data.usedCursor : undefined,
        startTime: typeof data?.startTime === "string" ? data.startTime : null,
        query: typeof data?.query === "string" ? data.query : null,
      });

      try {
        const refresh = await fetch(`/api/campaigns/${campaignId}`, { cache: "no-store" });
        const refreshed = await refresh.json().catch(() => null);
        if (refreshed?.stats) setStats(refreshed.stats);
        if (refreshed?.currentEpoch) setCurrentEpoch(refreshed.currentEpoch);
      } catch {
      }
    } catch (err) {
      console.error("Failed to scan tweets:", err);
      setError({ message: "Failed to scan tweets", traceId: null });
    } finally {
      setScanning(false);
    }
  };

  if (loading) {
    return <CampaignDetailSkeleton />;
  }

  if (!campaign) {
    return (
      <div className="min-h-screen bg-dark-bg py-12">
        <div className="mx-auto max-w-[1280px] px-6">
          <div className="text-center py-20 space-y-4">
            <h1 className="text-2xl font-bold text-white">Campaign Not Found</h1>
            <p className="text-sm text-foreground-secondary max-w-md mx-auto">
              {error?.message || "We couldn't load this campaign. It may have been removed or is temporarily unavailable."}
            </p>
            {error?.traceId && (
              <div className="text-xs text-foreground-secondary">
                Trace ID: <span className="font-mono text-white/80">{error.traceId}</span>
              </div>
            )}
            <Link href="/campaigns" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-dark-elevated border border-dark-border text-foreground-secondary hover:text-white transition-colors">
              <ArrowLeft className="h-4 w-4" /> Back to Campaigns
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const nowUnix = Math.floor(Date.now() / 1000);
  const hasEnded = nowUnix >= campaign.endAtUnix;
  const isPending = campaign.status === "pending";
  const isActive = campaign.status === "active" && !hasEnded;
  const statusLabel = isPending ? "Funding pending" : isActive ? "Active" : "Ended";
  const statusClass = isPending
    ? "bg-amplifi-yellow/10 text-amplifi-yellow border border-amplifi-yellow/20"
    : isActive
      ? "bg-amplifi-lime/10 text-amplifi-lime border border-amplifi-lime/20"
      : "bg-dark-surface text-foreground-secondary border border-dark-border/60";
  // Use totalFeeLamports for all-time fees, split 50/50
  const totalFee = Number(BigInt(campaign.totalFeeLamports || "0")) / 1e9;
  const holderShare = totalFee / 2;
  const creatorShare = totalFee / 2;

  const rawName = String(campaign.name ?? "").trim();
  const baseName = rawName.replace(/\s+engagement\s+campaign\s*$/i, "").trim() || rawName;

  return (
    <div className="min-h-screen bg-dark-bg py-12 relative overflow-hidden">
      <div className="pointer-events-none absolute -top-36 left-1/2 h-[360px] w-[860px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(124,92,255,0.16)_0%,rgba(31,75,255,0.05)_40%,rgba(11,12,14,0)_70%)] blur-3xl" />
      <div className="relative mx-auto max-w-[1280px] px-6">
        <Link href="/campaigns" className="inline-flex items-center text-sm text-foreground-secondary hover:text-amplifi-lime mb-8 transition-colors">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Campaigns
        </Link>

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6 mb-8 animate-fade-up">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <h1 className="text-3xl font-bold text-white">{baseName}</h1>
              <span className={`text-xs px-3 py-1 rounded-full font-medium ${statusClass}`}>
                {statusLabel}
              </span>
            </div>
            <div className="text-sm text-foreground-secondary mb-2">Engagement campaign</div>
            <div className="text-xs text-foreground-secondary mb-2">Campaign ID: {campaignId}</div>
            {campaign.description && <p className="text-foreground-secondary max-w-2xl">{campaign.description}</p>}
            {isPending && (
              <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-amplifi-yellow/20 bg-amplifi-yellow/10 px-3 py-2 text-xs text-amplifi-yellow">
                <AlertCircle className="h-4 w-4" />
                Funding pending. This campaign will go live once escrow funding confirms.
              </div>
            )}
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <Link
              href={`/campaigns/${encodeURIComponent(campaignId)}/leaderboard`}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-dark-elevated border border-dark-border text-foreground-secondary hover:text-white hover:border-amplifi-purple/30 transition-colors"
            >
              <TrendingUp className="h-4 w-4" /> Leaderboard
            </Link>
            <a
              href="#fee-distribution"
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-dark-elevated border border-dark-border text-foreground-secondary hover:text-white hover:border-amplifi-lime/30 transition-colors"
            >
              <Users className="h-4 w-4" /> Fee Split
            </a>

            {isActive && (
              <div className="flex-shrink-0">
                {!connected ? (
                  <div className="flex flex-col gap-2">
                    <WalletMultiButton />
                    <div className="text-xs text-foreground-secondary">Connect a wallet to join or scan.</div>
                  </div>
                ) : joined ? (
                  <div className="flex flex-col gap-2">
                    <button className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-amplifi-lime/20 text-amplifi-lime font-medium cursor-default">
                      <CheckCircle className="h-4 w-4" /> Joined
                    </button>
                    <button
                      onClick={() => void handleScanRecentTweets()}
                      disabled={scanning || !canScan}
                      className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-dark-elevated border border-dark-border text-foreground-secondary hover:text-white hover:border-amplifi-lime/30 transition-colors disabled:opacity-50"
                    >
                      <RotateCw className={`h-4 w-4 ${scanning ? "animate-spin" : ""}`} />
                      {scanning ? "Scanning..." : "Scan recent tweets"}
                    </button>
                    <button
                      onClick={() => void handleScanRecentTweets({ forceWindow: true })}
                      disabled={scanning || !canScan}
                      className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-dark-elevated border border-dark-border text-foreground-secondary hover:text-white hover:border-amplifi-purple/30 transition-colors disabled:opacity-50"
                    >
                      {scanning ? "Scanning..." : "Rescan full window"}
                    </button>
                    {scanCooldownLabel && (
                      <div className="text-xs text-foreground-secondary">{scanCooldownLabel}</div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <button onClick={handleJoinCampaign} disabled={joining} className="px-5 py-2.5 rounded-lg bg-amplifi-lime text-dark-bg font-medium hover:bg-amplifi-lime/90 transition-colors disabled:opacity-50">
                      {joining ? "Joining..." : "Join Campaign"}
                    </button>
                    {!signMessage && (
                      <div className="text-xs text-foreground-secondary">This wallet cannot sign messages. Try Phantom or Solflare.</div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {error && (
          <DataCard className="mb-8 border-red-500/20 bg-red-500/5">
            <div className="flex flex-col gap-2 p-4">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-red-400" />
                <p className="text-sm text-red-200">{error.message}</p>
              </div>
              {error.traceId && (
                <div className="text-xs text-red-200/80">
                  Trace ID: <span className="font-mono text-red-100">{error.traceId}</span>
                </div>
              )}
            </div>
          </DataCard>
        )}

        {scanResult && (
          <DataCard className="mb-8">
            <div className="flex flex-col gap-1 p-4">
              <div className="text-sm font-semibold text-white">Scan complete</div>
              <div className="text-xs text-foreground-secondary">
                Window: last {scanResult.windowDays}d | Found {scanResult.tweetsFound} | Already counted {scanResult.alreadyRecorded} | Newly credited {scanResult.engagementsRecorded}
              </div>
              {scanResult.message && <div className="text-xs text-foreground-secondary">{scanResult.message}</div>}
              {scanCooldownLabel && <div className="text-xs text-foreground-secondary">{scanCooldownLabel}</div>}
              {scanResult.startTime && (
                <div className="text-xs text-foreground-secondary">
                  Start time: {scanResult.startTime}{scanResult.usedCursor === true ? " (cursor)" : ""}
                </div>
              )}
              {scanResult.query && <div className="text-[11px] text-foreground-secondary break-all">Query: {scanResult.query}</div>}
            </div>
          </DataCard>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <DataCard><div className="p-5"><MetricDisplay value={lamportsToSol(campaign.rewardPoolLamports)} label="Reward Pool" suffix=" SOL" accent="lime" /></div></DataCard>
          <DataCard><div className="p-5"><MetricDisplay value={formatTimeRemaining(campaign.endAtUnix)} label="Time Remaining" accent="purple" /></div></DataCard>
          <DataCard><div className="p-5"><MetricDisplay value={stats?.participantCount?.toString() || "0"} label="Participants" accent="teal" /></div></DataCard>
          <DataCard><div className="p-5"><MetricDisplay value={stats?.totalEngagements?.toString() || "0"} label="Total Engagements" /></div></DataCard>
        </div>

        {/* Epoch Progress + Fee Split */}
        <div className="grid lg:grid-cols-2 gap-6 mb-8">
          {currentEpoch && (
            <EpochProgress
              epochNumber={currentEpoch.epochNumber}
              endTime={currentEpoch.endAtUnix}
              poolSize={lamportsToSol(currentEpoch.rewardPoolLamports)}
              engagerCount={stats?.uniqueEngagers || 0}
            />
          )}
          <div id="fee-distribution">
            <FeeSplitBar totalFee={totalFee} creatorShare={creatorShare} holderShare={holderShare} currency="SOL" />
          </div>
        </div>

        {/* Engagement Points */}
        <div className="mb-8">
          <EngagementPointsLegend />
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="md:col-span-2 space-y-6">
            {/* How to Participate */}
            <DataCard>
              <div className="p-5">
                <div className="flex items-center gap-2 mb-5">
                  <Target className="h-5 w-5 text-amplifi-purple" />
                  <h3 className="text-lg font-semibold text-white">How to Participate</h3>
                </div>
                <div className="space-y-4">
                  {[
                    { step: 1, title: "Connect & Verify", desc: "Connect your wallet and link your verified X (Twitter) account." },
                    { step: 2, title: "Join Campaign", desc: "Click \"Join Campaign\" to opt in and start earning." },
                    { step: 3, title: "Engage", desc: "Tweet, reply, retweet, or quote posts mentioning the tracked handles/hashtags." },
                    { step: 4, title: "Claim Rewards", desc: "After each epoch settles, claim your share of the reward pool." },
                  ].map((item) => (
                    <div key={item.step} className="flex items-start gap-4">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amplifi-lime/10 text-amplifi-lime text-sm font-bold flex-shrink-0">{item.step}</div>
                      <div>
                        <h4 className="font-medium text-white">{item.title}</h4>
                        <p className="text-sm text-foreground-secondary">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </DataCard>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Tracking Info */}
            <DataCard>
              <div className="p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Twitter className="h-5 w-5 text-amplifi-lime" />
                  <h3 className="text-lg font-semibold text-white">What to Mention</h3>
                </div>
                <div className="space-y-4">
                  {campaign.trackingHandles.length > 0 && (
                    <div>
                      <div className="text-xs text-foreground-secondary uppercase tracking-wider mb-2">Handles</div>
                      <div className="flex flex-wrap gap-2">
                        {campaign.trackingHandles.map((handle) => (
                          <span key={handle} className="text-sm px-2.5 py-1 rounded-full bg-dark-surface text-amplifi-lime">@{handle.replace("@", "")}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {campaign.trackingHashtags.length > 0 && (
                    <div>
                      <div className="text-xs text-foreground-secondary uppercase tracking-wider mb-2">Tags</div>
                      <div className="flex flex-wrap gap-2">
                        {campaign.trackingHashtags.map((tag) => (
                          <span key={tag} className="text-sm px-2.5 py-1 rounded-full bg-dark-surface text-amplifi-purple">
                            {tag.trim().startsWith("$") ? "$" : "#"}
                            {tag.replace(/^[#$]+/, "")}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </DataCard>

            {/* Campaign Details */}
            <DataCard>
              <div className="p-5">
                <h3 className="text-lg font-semibold text-white mb-4">Campaign Details</h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between"><span className="text-foreground-secondary">Epoch Duration</span><span className="font-medium text-white">{formatEpochDuration(campaign.epochDurationSeconds)}</span></div>
                  <div className="flex justify-between"><span className="text-foreground-secondary">Min. Token Balance</span><span className="font-medium text-white">{Number(campaign.minTokenBalance) > 0 ? campaign.minTokenBalance : "None"}</span></div>
                  <div className="flex justify-between"><span className="text-foreground-secondary">Start Date</span><span className="font-medium text-white">{new Date(campaign.startAtUnix * 1000).toLocaleDateString()}</span></div>
                  <div className="flex justify-between"><span className="text-foreground-secondary">End Date</span><span className="font-medium text-white">{new Date(campaign.endAtUnix * 1000).toLocaleDateString()}</span></div>
                  <div className="flex justify-between"><span className="text-foreground-secondary">Token Mint</span><span className="font-mono text-xs text-foreground-secondary">{campaign.tokenMint.slice(0, 8)}...</span></div>
                </div>
              </div>
            </DataCard>
          </div>
        </div>
      </div>
    </div>
  );
}

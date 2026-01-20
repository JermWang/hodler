"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import Link from "next/link";
import bs58 from "bs58";
import { ArrowLeft, Clock, Users, TrendingUp, Twitter, CheckCircle, AlertCircle, Target } from "lucide-react";
import { DataCard, MetricDisplay } from "@/app/components/ui/data-card";
import { EpochProgress, FeeSplitBar, EngagementPointsLegend } from "@/app/components/ui/amplifi-components";

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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!campaignId) return;
    const fetchCampaign = async () => {
      try {
        const res = await fetch(`/api/campaigns/${campaignId}`);
        const data = await res.json();
        if (data.campaign) setCampaign(data.campaign);
        if (data.currentEpoch) setCurrentEpoch(data.currentEpoch);
        if (data.stats) setStats(data.stats);
      } catch (err) {
        console.error("Failed to fetch campaign:", err);
        setError("Failed to load campaign");
      } finally {
        setLoading(false);
      }
    };
    fetchCampaign();
  }, [campaignId]);

  const handleJoinCampaign = async () => {
    if (!publicKey || !campaign || !signMessage) return;
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
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to join campaign");
        return;
      }
      setJoined(true);
    } catch (err) {
      console.error("Failed to join campaign:", err);
      setError("Failed to join campaign");
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-bg py-12">
        <div className="mx-auto max-w-[1280px] px-6">
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-amplifi-lime border-t-transparent"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="min-h-screen bg-dark-bg py-12">
        <div className="mx-auto max-w-[1280px] px-6">
          <div className="text-center py-20">
            <h1 className="text-2xl font-bold text-white mb-4">Campaign Not Found</h1>
            <Link href="/campaigns" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-dark-elevated border border-dark-border text-foreground-secondary hover:text-white transition-colors">
              <ArrowLeft className="h-4 w-4" /> Back to Campaigns
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isActive = campaign.status === "active" && Math.floor(Date.now() / 1000) < campaign.endAtUnix;
  const totalFee = Number(BigInt(campaign.totalFeeLamports)) / 1e9;

  return (
    <div className="min-h-screen bg-dark-bg py-12">
      <div className="mx-auto max-w-[1280px] px-6">
        <Link href="/campaigns" className="inline-flex items-center text-sm text-foreground-secondary hover:text-amplifi-lime mb-8 transition-colors">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Campaigns
        </Link>

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <h1 className="text-3xl font-bold text-white">{campaign.name}</h1>
              <span className={`text-xs px-3 py-1 rounded-full font-medium ${isActive ? "bg-amplifi-lime/10 text-amplifi-lime" : "bg-dark-surface text-foreground-secondary"}`}>
                {isActive ? "Active" : "Ended"}
              </span>
            </div>
            {campaign.description && <p className="text-foreground-secondary max-w-2xl">{campaign.description}</p>}
          </div>
          {isActive && (
            <div className="flex-shrink-0">
              {!connected ? (
                <WalletMultiButton />
              ) : joined ? (
                <button className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-amplifi-lime/20 text-amplifi-lime font-medium cursor-default">
                  <CheckCircle className="h-4 w-4" /> Joined
                </button>
              ) : (
                <button onClick={handleJoinCampaign} disabled={joining} className="px-5 py-2.5 rounded-lg bg-amplifi-lime text-dark-bg font-medium hover:bg-amplifi-lime/90 transition-colors disabled:opacity-50">
                  {joining ? "Joining..." : "Join Campaign"}
                </button>
              )}
            </div>
          )}
        </div>

        {error && (
          <DataCard className="mb-8 border-red-500/20 bg-red-500/5">
            <div className="flex items-center gap-3 p-4">
              <AlertCircle className="h-5 w-5 text-red-500" />
              <p className="text-sm text-red-400">{error}</p>
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
          <FeeSplitBar totalFee={totalFee} currency="SOL" />
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
                    { step: 1, title: "Connect & Verify", desc: "Connect your wallet and verify your Twitter account." },
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
                      <div className="text-xs text-foreground-secondary uppercase tracking-wider mb-2">Hashtags</div>
                      <div className="flex flex-wrap gap-2">
                        {campaign.trackingHashtags.map((tag) => (
                          <span key={tag} className="text-sm px-2.5 py-1 rounded-full bg-dark-surface text-amplifi-purple">#{tag.replace("#", "")}</span>
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

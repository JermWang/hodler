"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Transaction, VersionedTransaction } from "@solana/web3.js";
import Link from "next/link";
import bs58 from "bs58";
import { 
  ArrowRight, Twitter, Wallet, TrendingUp, Gift, CheckCircle, 
  Zap, Award, BarChart3, Clock, ChevronRight, Users, Star,
  ArrowUpRight, Activity, BookOpen, Copy, RefreshCw, ExternalLink, Filter
} from "lucide-react";
import { DataCard, DataCardHeader, MetricDisplay } from "@/app/components/ui/data-card";
import { StatusBadge } from "@/app/components/ui/activity-feed";
import {
  RankingTable,
  RankingTableHeader,
  RankingTableHead,
  RankingTableBody,
  RankingTableRow,
  RankingTableCell,
} from "@/app/components/ui/ranking-table";
import { cn } from "@/app/lib/utils";

type PlatformFilter = "all" | "amplifi" | "bags";

interface BagsPosition {
  baseMint: string;
  claimableLamports: number;
}

interface UnifiedClaimable {
  amplifi: {
    available: boolean;
    totalLamports: number;
    rewardCount: number;
  };
  bags: {
    available: boolean;
    totalLamports: number;
    positionCount: number;
    positions: BagsPosition[];
    error?: string;
  };
  totalClaimableLamports: number;
  totalClaimableSol: number;
}

function BagsLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className}>
      <rect width="32" height="32" rx="8" fill="#1a1a2e"/>
      <path d="M8 12h16v2H8v-2zm2 4h12v6a2 2 0 01-2 2h-8a2 2 0 01-2-2v-6z" fill="#00d4aa"/>
      <path d="M10 10a2 2 0 012-2h8a2 2 0 012 2v2H10v-2z" fill="#00d4aa" fillOpacity="0.6"/>
      <circle cx="16" cy="19" r="2" fill="#1a1a2e"/>
    </svg>
  );
}

function AmpliFiLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className}>
      <rect width="32" height="32" rx="8" fill="#0f0f14"/>
      <path d="M16 6l10 6v12l-10 6-10-6V12l10-6z" fill="#B6F04A" fillOpacity="0.15"/>
      <path d="M16 8l8 4.8v9.6L16 27.2l-8-4.8V12.8L16 8z" stroke="#B6F04A" strokeWidth="1.5"/>
      <text x="16" y="20" textAnchor="middle" fill="#B6F04A" fontSize="10" fontWeight="bold">A</text>
    </svg>
  );
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function decodeTxFromBase64(b64: string): Transaction | VersionedTransaction {
  const bytes = base64ToBytes(b64);
  try {
    return VersionedTransaction.deserialize(bytes);
  } catch {
    return Transaction.from(bytes);
  }
}

function solscanTxUrl(sig: string): string {
  const s = String(sig ?? "").trim();
  if (!s) return "";
  return `https://solscan.io/tx/${encodeURIComponent(s)}`;
}

interface HolderRegistration {
  id: string;
  walletPubkey: string;
  twitterUserId: string;
  twitterUsername: string;
  twitterDisplayName: string;
  twitterProfileImageUrl?: string;
  verifiedAtUnix: number;
  status: string;
}

interface HolderStats {
  totalEarned: string;
  totalClaimed: string;
  totalPending: string;
  campaignsJoined: number;
  totalEngagements: number;
  averageScore: number;
}

interface ClaimableReward {
  epochId: string;
  campaignId: string;
  campaignName: string;
  epochNumber: number;
  rewardLamports: string;
  shareBps: number;
  engagementCount: number;
  settledAtUnix: number;
  claimed: boolean;
}

function lamportsToSol(lamports: string): string {
  const value = BigInt(lamports);
  const sol = Number(value) / 1e9;
  return sol.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

export default function HolderDashboard() {
  const { publicKey, connected, signMessage, sendTransaction } = useWallet();
  const { connection } = useConnection();
  
  const [registration, setRegistration] = useState<HolderRegistration | null>(null);
  const [stats, setStats] = useState<HolderStats | null>(null);
  const [rewards, setRewards] = useState<ClaimableReward[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTwitterPrompt, setShowTwitterPrompt] = useState(true);
  
  // Unified claimable state
  const [unifiedClaimable, setUnifiedClaimable] = useState<UnifiedClaimable | null>(null);
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all");
  
  // Bags claim state
  const [bagsClaimLoading, setBagsClaimLoading] = useState(false);
  const [bagsClaimError, setBagsClaimError] = useState<string | null>(null);
  const [bagsClaimSigs, setBagsClaimSigs] = useState<string[]>([]);
  
  // AmpliFi claim state  
  const [amplifiClaimLoading, setAmplifiClaimLoading] = useState(false);
  const [amplifiClaimError, setAmplifiClaimError] = useState<string | null>(null);
  const [amplifiClaimSig, setAmplifiClaimSig] = useState<string | null>(null);

  const walletPubkey = useMemo(() => publicKey?.toBase58() ?? "", [publicKey]);

  const campaignPerformance = useMemo(() => {
    const byName = new Map<
      string,
      {
        name: string;
        epochs: number;
        engagementCount: number;
        rewardLamports: number;
      }
    >();

    for (const r of rewards) {
      const name = String(r?.campaignName ?? "").trim();
      if (!name) continue;
      const existing = byName.get(name) ?? {
        name,
        epochs: 0,
        engagementCount: 0,
        rewardLamports: 0,
      };

      existing.epochs += 1;
      existing.engagementCount += Math.max(0, Number(r?.engagementCount ?? 0) || 0);
      existing.rewardLamports += Number(r?.rewardLamports ?? 0) || 0;
      byName.set(name, existing);
    }

    return Array.from(byName.values()).sort((a, b) => {
      if (a.rewardLamports === b.rewardLamports) return a.name.localeCompare(b.name);
      return b.rewardLamports - a.rewardLamports;
    });
  }, [rewards]);

  // Fetch unified claimable balances
  const refreshClaimable = useCallback(async () => {
    if (!walletPubkey) return;
    try {
      const res = await fetch(`/api/holder/claimable?wallet=${walletPubkey}`);
      const json = await res.json().catch(() => null);
      if (res.ok && json) {
        setUnifiedClaimable(json);
      }
    } catch (e) {
      console.error("Failed to fetch claimable:", e);
    }
  }, [walletPubkey]);

  // Handle Bags claim
  const handleBagsClaim = useCallback(async () => {
    if (!walletPubkey || !signMessage || !sendTransaction) return;
    
    setBagsClaimError(null);
    setBagsClaimSigs([]);
    setBagsClaimLoading(true);

    try {
      const timestampUnix = Math.floor(Date.now() / 1000);
      const msg = `AmpliFi\nBags Claim\nWallet: ${walletPubkey}\nTimestamp: ${timestampUnix}`;
      const sigBytes = await signMessage(new TextEncoder().encode(msg));
      const signatureB58 = bs58.encode(sigBytes);

      const res = await fetch("/api/bags/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletPubkey, timestampUnix, signatureB58 }),
      });
      const json = await res.json().catch(() => null);
      
      if (!res.ok) {
        setBagsClaimError(String(json?.error || "Bags claim failed"));
        return;
      }

      const txs: string[] = Array.isArray(json?.transactions) ? json.transactions : [];
      if (txs.length === 0) {
        await refreshClaimable();
        return;
      }

      const sigs: string[] = [];
      for (const txBase64 of txs) {
        const tx = decodeTxFromBase64(String(txBase64));
        const sig = await sendTransaction(tx, connection, { preflightCommitment: "confirmed" });
        sigs.push(sig);
      }

      setBagsClaimSigs(sigs);
      await refreshClaimable();
    } catch (e) {
      setBagsClaimError(e instanceof Error ? e.message : "Bags claim failed");
    } finally {
      setBagsClaimLoading(false);
    }
  }, [walletPubkey, signMessage, sendTransaction, connection, refreshClaimable]);

  // Handle AmpliFi claim
  const handleAmplifiClaim = useCallback(async () => {
    if (!walletPubkey || !signMessage || !sendTransaction) return;
    
    setAmplifiClaimError(null);
    setAmplifiClaimSig(null);
    setAmplifiClaimLoading(true);

    try {
      const timestampUnix = Math.floor(Date.now() / 1000);
      const msg = `AmpliFi\nHolder Rewards Claim\nWallet: ${walletPubkey}\nTimestamp: ${timestampUnix}`;
      const sigBytes = await signMessage(new TextEncoder().encode(msg));
      const signatureB58 = bs58.encode(sigBytes);

      // Get claim transaction
      const res = await fetch(`/api/holder/rewards/claim?wallet=${walletPubkey}`);
      const json = await res.json().catch(() => null);
      
      if (!res.ok) {
        setAmplifiClaimError(String(json?.error || "Failed to get claim transaction"));
        return;
      }

      const txBase64 = String(json?.transaction ?? "").trim();
      if (!txBase64) {
        setAmplifiClaimError("No rewards to claim");
        return;
      }

      const tx = decodeTxFromBase64(txBase64);
      const sig = await sendTransaction(tx, connection, { preflightCommitment: "confirmed" });
      
      // Confirm the claim
      await fetch("/api/holder/rewards/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: walletPubkey, signature: sig, signatureB58, timestampUnix }),
      });

      setAmplifiClaimSig(sig);
      await refreshClaimable();
    } catch (e) {
      setAmplifiClaimError(e instanceof Error ? e.message : "Claim failed");
    } finally {
      setAmplifiClaimLoading(false);
    }
  }, [walletPubkey, signMessage, sendTransaction, connection, refreshClaimable]);

  useEffect(() => {
    if (!connected || !publicKey) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const walletPubkey = publicKey.toBase58();

        // Fetch registration status
        const regRes = await fetch(`/api/holder/registration?wallet=${walletPubkey}`);
        const regData = await regRes.json();
        
        if (regData.registered) {
          setRegistration(regData.registration);
        }

        // Fetch rewards and stats
        const rewardsRes = await fetch(`/api/holder/rewards?wallet=${walletPubkey}`);
        const rewardsData = await rewardsRes.json();
        
        if (rewardsData.stats) {
          setStats(rewardsData.stats);
        }
        if (rewardsData.rewards) {
          setRewards(rewardsData.rewards);
        }

        // Fetch unified claimable
        await refreshClaimable();
      } catch (err) {
        console.error("Failed to fetch holder data:", err);
        setError("Failed to load dashboard data");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [connected, publicKey, refreshClaimable]);

  const handleConnectTwitter = async () => {
    if (!publicKey || !signMessage) return;

    const walletPubkey = publicKey.toBase58();
    const timestamp = Math.floor(Date.now() / 1000);
    const msg = `AmpliFi\nTwitter Auth\nWallet: ${walletPubkey}\nTimestamp: ${timestamp}`;

    const sigBytes = await signMessage(new TextEncoder().encode(msg));
    const signatureB58 = bs58.encode(sigBytes);

    window.location.href = `/api/twitter/auth?walletPubkey=${encodeURIComponent(walletPubkey)}&signature=${encodeURIComponent(
      signatureB58
    )}&timestamp=${encodeURIComponent(String(timestamp))}`;
  };

  if (!connected) {
    return (
      <div className="min-h-screen bg-dark-bg">
        <div className="mx-auto max-w-[1280px] px-6 pt-32 pb-16">
          <div className="flex flex-col items-center justify-center text-center py-20">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-amplifi-lime/10 mb-6">
              <Wallet className="h-10 w-10 text-amplifi-lime" />
            </div>
            <h1 className="text-4xl font-bold text-white mb-4">
              Connect Your Wallet
            </h1>
            <p className="text-lg text-foreground-secondary mb-8 max-w-md">
              Connect your Solana wallet to view your rewards, track your engagement, 
              and claim your earnings.
            </p>
            <WalletMultiButton />
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-bg">
        <div className="mx-auto max-w-[1280px] px-6 pt-32 pb-16">
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amplifi-lime"></div>
          </div>
        </div>
      </div>
    );
  }

  const walletAddress = publicKey?.toBase58() || "";
  const shortAddress = `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;

  return (
    <div className="min-h-screen bg-dark-bg">
      {/* Twitter Connect Prompt Modal */}
      {!registration && showTwitterPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="relative bg-dark-elevated border border-dark-border rounded-2xl p-8 max-w-md mx-4 shadow-2xl">
            <button
              onClick={() => setShowTwitterPrompt(false)}
              className="absolute top-4 right-4 text-foreground-muted hover:text-white transition-colors"
              aria-label="Close"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <div className="flex flex-col items-center text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amplifi-purple/20 mb-5">
                <Twitter className="h-8 w-8 text-amplifi-purple" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-3">
                Connect Your X Account
              </h2>
              <p className="text-foreground-secondary mb-4">
                Link your X (Twitter) account to start earning SOL rewards for your engagement. 
                We track your tweets and pay you based on your score.
              </p>
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amplifi-purple/10 border border-amplifi-purple/20 mb-4">
                <CheckCircle className="h-4 w-4 text-amplifi-purple mt-0.5 flex-shrink-0" />
                <p className="text-xs text-foreground-secondary">
                  <span className="text-amplifi-purple font-medium">Verified accounts only.</span> To protect against bots and ensure meaningful rewards for real users, only X Premium (Blue) verified accounts are eligible for payouts.
                </p>
              </div>
              <button
                onClick={handleConnectTwitter}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-amplifi-purple text-white font-semibold hover:bg-amplifi-purple-dark transition-colors mb-3"
              >
                <Twitter className="h-5 w-5" />
                Connect X Account
              </button>
              <button
                onClick={() => setShowTwitterPrompt(false)}
                className="text-sm text-foreground-muted hover:text-white transition-colors"
              >
                Skip for now
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-[1280px] px-6 pt-28 pb-16">
        {/* Header with wallet info */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 mb-10">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold text-white">Dashboard</h1>
              {registration && (
                <StatusBadge status="active" />
              )}
            </div>
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2 text-foreground-secondary">
                <Wallet className="h-4 w-4" />
                <span className="font-mono">{shortAddress}</span>
                <button className="hover:text-white transition-colors">
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
              {registration && (
                <div className="flex items-center gap-2 text-foreground-secondary">
                  <Twitter className="h-4 w-4" />
                  <span>@{registration.twitterUsername}</span>
                  <CheckCircle className="h-3.5 w-3.5 text-amplifi-lime" />
                </div>
              )}
            </div>
          </div>
          
          {!registration && (
            <button
              onClick={handleConnectTwitter}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amplifi-purple text-white font-medium hover:bg-amplifi-purple-dark transition-colors"
            >
              <Twitter className="h-4 w-4" />
              Connect Twitter
            </button>
          )}
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <DataCard variant="elevated" className="p-5">
            <MetricDisplay
              value={stats ? lamportsToSol(stats.totalEarned) : "0.00"}
              label="Total Earned"
              suffix=" SOL"
              size="md"
              accent="lime"
            />
          </DataCard>
          <DataCard variant="elevated" className="p-5">
            <MetricDisplay
              value={stats ? lamportsToSol(stats.totalPending) : "0.00"}
              label="Pending Rewards"
              suffix=" SOL"
              size="md"
              accent="teal"
            />
          </DataCard>
          <DataCard variant="elevated" className="p-5">
            <MetricDisplay
              value={stats?.campaignsJoined.toString() || "0"}
              label="Active Campaigns"
              size="md"
            />
          </DataCard>
          <DataCard variant="elevated" className="p-5">
            <MetricDisplay
              value={stats?.totalEngagements.toString() || "0"}
              label="Total Engagements"
              size="md"
            />
          </DataCard>
        </div>

        {/* Unified Claimable Section */}
        <DataCard className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div>
              <h2 className="text-xl font-bold text-white">Claimable Rewards</h2>
              <p className="text-sm text-foreground-secondary mt-1">
                Total: {unifiedClaimable?.totalClaimableSol?.toFixed(4) || "0.00"} SOL across all platforms
              </p>
            </div>
            
            {/* Platform Filter Toggle */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-dark-elevated border border-dark-border">
              {[
                { key: "all" as PlatformFilter, label: "All" },
                { key: "amplifi" as PlatformFilter, label: "AmpliFi" },
                { key: "bags" as PlatformFilter, label: "Bags" },
              ].map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setPlatformFilter(opt.key)}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                    platformFilter === opt.key
                      ? "bg-amplifi-lime text-dark-bg"
                      : "text-foreground-secondary hover:text-white"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {/* AmpliFi Rewards Card */}
            {(platformFilter === "all" || platformFilter === "amplifi") && (
              <div className="rounded-xl border border-dark-border bg-dark-elevated/30 p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <AmpliFiLogo className="h-10 w-10 rounded-lg" />
                    <div>
                      <div className="font-semibold text-white">AmpliFi Campaigns</div>
                      <div className="text-xs text-foreground-secondary">
                        {unifiedClaimable?.amplifi.rewardCount || 0} rewards pending
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-bold text-amplifi-lime">
                      {((unifiedClaimable?.amplifi.totalLamports || 0) / 1e9).toFixed(4)}
                    </div>
                    <div className="text-xs text-foreground-secondary">SOL</div>
                  </div>
                </div>
                
                {amplifiClaimError && (
                  <div className="text-xs text-red-400 mb-3 p-2 rounded bg-red-500/10">{amplifiClaimError}</div>
                )}
                {amplifiClaimSig && (
                  <div className="text-xs text-foreground-secondary mb-3">
                    <a href={solscanTxUrl(amplifiClaimSig)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-amplifi-lime hover:underline">
                      <ExternalLink className="h-3 w-3" />
                      View transaction
                    </a>
                  </div>
                )}
                
                <button
                  onClick={handleAmplifiClaim}
                  disabled={amplifiClaimLoading || (unifiedClaimable?.amplifi.totalLamports || 0) === 0}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-amplifi-lime text-dark-bg text-sm font-semibold hover:bg-amplifi-lime-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Gift className="h-4 w-4" />
                  {amplifiClaimLoading ? "Claiming..." : "Claim AmpliFi Rewards"}
                </button>
              </div>
            )}

            {/* Bags.fm Rewards Card */}
            {(platformFilter === "all" || platformFilter === "bags") && (
              <div className="rounded-xl border border-dark-border bg-dark-elevated/30 p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <BagsLogo className="h-10 w-10 rounded-lg" />
                    <div>
                      <div className="font-semibold text-white">Bags.fm Fee Shares</div>
                      <div className="text-xs text-foreground-secondary">
                        {unifiedClaimable?.bags.positionCount || 0} positions
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-bold text-[#00d4aa]">
                      {((unifiedClaimable?.bags.totalLamports || 0) / 1e9).toFixed(4)}
                    </div>
                    <div className="text-xs text-foreground-secondary">SOL</div>
                  </div>
                </div>
                
                {bagsClaimError && (
                  <div className="text-xs text-red-400 mb-3 p-2 rounded bg-red-500/10">{bagsClaimError}</div>
                )}
                {bagsClaimSigs.length > 0 && (
                  <div className="text-xs text-foreground-secondary mb-3 space-y-1">
                    {bagsClaimSigs.slice(0, 2).map((sig) => (
                      <a key={sig} href={solscanTxUrl(sig)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[#00d4aa] hover:underline">
                        <ExternalLink className="h-3 w-3" />
                        {sig.slice(0, 8)}...{sig.slice(-4)}
                      </a>
                    ))}
                  </div>
                )}
                
                <button
                  onClick={handleBagsClaim}
                  disabled={bagsClaimLoading || (unifiedClaimable?.bags.totalLamports || 0) === 0}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#00d4aa] text-dark-bg text-sm font-semibold hover:bg-[#00b894] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Gift className="h-4 w-4" />
                  {bagsClaimLoading ? "Claiming..." : "Claim Bags Fees"}
                </button>
              </div>
            )}
          </div>
        </DataCard>

        {/* Main Grid */}
        <div className="grid lg:grid-cols-3 gap-6 mb-8">
          {/* Campaign Rewards History */}
          <DataCard className="lg:col-span-2">
            <DataCardHeader
              title="Campaign Rewards"
              subtitle={`${rewards.filter(r => !r.claimed).length} pending from AmpliFi campaigns`}
              action={
                <button
                  onClick={() => void refreshClaimable()}
                  className="text-xs text-foreground-secondary hover:text-white flex items-center gap-1"
                >
                  <RefreshCw className="h-3 w-3" />
                  Refresh
                </button>
              }
            />
            
            {rewards.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-dark-border mb-4">
                  <TrendingUp className="h-7 w-7 text-foreground-secondary" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">No Rewards Yet</h3>
                <p className="text-sm text-foreground-secondary max-w-sm mb-6">
                  Join campaigns and engage with projects to start earning rewards.
                </p>
                <Link
                  href="/campaigns"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-dark-border text-white text-sm font-medium hover:bg-dark-elevated transition-colors"
                >
                  Explore Campaigns
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {rewards.slice(0, 5).map((reward) => (
                  <div
                    key={`${reward.epochId}-${reward.campaignId}`}
                    className="flex items-center justify-between p-4 rounded-xl bg-dark-elevated/50 hover:bg-dark-elevated transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-gradient-to-br from-amplifi-purple to-amplifi-teal flex items-center justify-center text-white font-bold text-xs">
                        {reward.campaignName.slice(0, 2)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white">{reward.campaignName}</span>
                          <span className="text-xs px-2 py-0.5 rounded bg-dark-border text-foreground-secondary">
                            Epoch {reward.epochNumber}
                          </span>
                          {reward.claimed && (
                            <span className="text-xs px-2 py-0.5 rounded bg-amplifi-teal/10 text-amplifi-teal">
                              Claimed
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-foreground-secondary">
                          {reward.engagementCount} engagements · {(reward.shareBps / 100).toFixed(2)}% share
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-amplifi-lime">
                        {lamportsToSol(reward.rewardLamports)} SOL
                      </div>
                      <div className="text-xs text-foreground-secondary">
                        {new Date(reward.settledAtUnix * 1000).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </DataCard>

          {/* Recent Engagements */}
          <DataCard>
            <DataCardHeader
              title="Your Engagements"
              subtitle="This epoch"
              action={
                <Link href="/campaigns" className="text-xs text-amplifi-lime hover:underline flex items-center gap-1">
                  View campaigns <ChevronRight className="h-3 w-3" />
                </Link>
              }
            />
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-dark-border mb-4">
                <Activity className="h-7 w-7 text-foreground-secondary" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">No engagement activity yet</h3>
              <p className="text-sm text-foreground-secondary max-w-sm">
                Your verified tweet-level engagement history will appear here once tracking is enabled for your campaigns.
              </p>
            </div>
          </DataCard>
        </div>

        {/* Campaign Performance */}
        <DataCard className="mb-8">
          <DataCardHeader
            title="Campaign Performance"
            subtitle="Your engagement across active campaigns"
            action={
              <Link href="/campaigns" className="text-xs text-amplifi-lime hover:underline flex items-center gap-1">
                Browse campaigns <ChevronRight className="h-3 w-3" />
              </Link>
            }
          />

          {campaignPerformance.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-dark-border mb-4">
                <BarChart3 className="h-7 w-7 text-foreground-secondary" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">No campaign performance yet</h3>
              <p className="text-sm text-foreground-secondary max-w-sm">
                Join a campaign and start engaging to see your performance summary here.
              </p>
            </div>
          ) : (
            <RankingTable>
              <RankingTableHeader>
                <RankingTableHead>Campaign</RankingTableHead>
                <RankingTableHead align="right">Epochs</RankingTableHead>
                <RankingTableHead align="right">Engagements</RankingTableHead>
                <RankingTableHead align="right">Rewards</RankingTableHead>
              </RankingTableHeader>
              <RankingTableBody>
                {campaignPerformance.map((campaign) => (
                  <RankingTableRow key={campaign.name}>
                    <RankingTableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-amplifi-purple to-amplifi-teal flex items-center justify-center text-white font-bold text-xs">
                          {campaign.name.slice(0, 2)}
                        </div>
                        <div>
                          <div className="font-medium text-white">{campaign.name}</div>
                        </div>
                      </div>
                    </RankingTableCell>
                    <RankingTableCell align="right">
                      <span className="font-semibold text-white">{campaign.epochs}</span>
                    </RankingTableCell>
                    <RankingTableCell align="right">
                      <span className="font-semibold text-white">{campaign.engagementCount}</span>
                    </RankingTableCell>
                    <RankingTableCell align="right">
                      <span className="text-amplifi-lime font-medium">{lamportsToSol(String(campaign.rewardLamports))} SOL</span>
                    </RankingTableCell>
                  </RankingTableRow>
                ))}
              </RankingTableBody>
            </RankingTable>
          )}
        </DataCard>

        {/* Quick Actions */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link href="/campaigns" className="group">
            <DataCard className="h-full transition-all hover-shimmer">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amplifi-lime/10 mb-3">
                <Star className="h-5 w-5 text-amplifi-lime" />
              </div>
              <h3 className="font-semibold text-white mb-1">Explore Campaigns</h3>
              <p className="text-sm text-foreground-secondary">Find new projects to support</p>
            </DataCard>
          </Link>
          
          <Link href="/leaderboard" className="group">
            <DataCard className="h-full transition-all hover-shimmer">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amplifi-purple/10 mb-3">
                <BarChart3 className="h-5 w-5 text-amplifi-purple" />
              </div>
              <h3 className="font-semibold text-white mb-1">Leaderboards</h3>
              <p className="text-sm text-foreground-secondary">See top performers</p>
            </DataCard>
          </Link>
          
          <Link href="/discover" className="group">
            <DataCard className="h-full transition-all hover-shimmer">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amplifi-teal/10 mb-3">
                <TrendingUp className="h-5 w-5 text-amplifi-teal" />
              </div>
              <h3 className="font-semibold text-white mb-1">Discover Tokens</h3>
              <p className="text-sm text-foreground-secondary">Find new opportunities</p>
            </DataCard>
          </Link>
          
          <Link href="/docs" className="group">
            <DataCard className="h-full transition-all hover-shimmer">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amplifi-orange/10 mb-3">
                <BookOpen className="h-5 w-5 text-amplifi-orange" />
              </div>
              <h3 className="font-semibold text-white mb-1">Documentation</h3>
              <p className="text-sm text-foreground-secondary">Learn how it works</p>
            </DataCard>
          </Link>
        </div>
      </div>
    </div>
  );
}

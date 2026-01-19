"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { 
  Wallet, 
  TrendingUp, 
  Gift, 
  History, 
  ExternalLink,
  Zap,
  Target,
  Users,
  ArrowRight
} from "lucide-react";
import { DataCard, MetricDisplay } from "@/app/components/ui/data-card";

interface HolderStats {
  totalEarned: string;
  claimableRewards: string;
  activeCampaigns: number;
  totalEngagements: number;
  rank?: number;
}

interface RewardHistory {
  id: string;
  campaignName: string;
  amount: string;
  epochNumber: number;
  claimedAt: number;
  txSig?: string;
}

function shortWallet(pk: string): string {
  const s = String(pk ?? "").trim();
  if (!s) return "";
  if (s.length <= 10) return s;
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

function formatDate(unix: number): string {
  if (!Number.isFinite(unix) || unix <= 0) return "";
  return new Date(unix * 1000).toLocaleDateString("en-US", { 
    month: "short", 
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export default function DashboardPage() {
  const { setVisible } = useWalletModal();
  const { publicKey, connected } = useWallet();
  const walletPubkey = publicKey?.toBase58() ?? "";

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<HolderStats | null>(null);
  const [history, setHistory] = useState<RewardHistory[]>([]);

  useEffect(() => {
    if (!connected || !walletPubkey) {
      setStats(null);
      setHistory([]);
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/holder/rewards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ walletPubkey }),
        });
        const data = await res.json();
        if (data.stats) {
          setStats(data.stats);
        }
        if (data.history) {
          setHistory(data.history);
        }
      } catch (err) {
        console.error("Failed to fetch holder data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [connected, walletPubkey]);

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
              Holder Dashboard
            </h1>
          </div>
          <p className="text-foreground-secondary max-w-xl">
            Track your engagement rewards, view your campaign participation, and claim your earnings.
          </p>
        </div>

        {!connected ? (
          /* Not Connected State */
          <DataCard className="max-w-lg mx-auto">
            <div className="p-8 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amplifi-lime/10 mx-auto mb-5">
                <Wallet className="h-8 w-8 text-amplifi-lime" />
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">
                Connect Your Wallet
              </h2>
              <p className="text-foreground-secondary mb-6">
                Connect your wallet to view your engagement rewards and campaign participation.
              </p>
              <button
                onClick={() => setVisible(true)}
                className="px-6 py-3 rounded-xl bg-amplifi-lime text-dark-bg font-medium hover:bg-amplifi-lime/90 transition-colors"
              >
                Connect Wallet
              </button>
            </div>
          </DataCard>
        ) : loading ? (
          /* Loading State */
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-amplifi-lime border-t-transparent"></div>
          </div>
        ) : (
          /* Connected State */
          <>
            {/* Wallet Info */}
            <div className="mb-8 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-dark-surface">
                <Wallet className="h-5 w-5 text-foreground-secondary" />
              </div>
              <div>
                <div className="text-sm text-foreground-secondary">Connected Wallet</div>
                <div className="font-mono text-white">{shortWallet(walletPubkey)}</div>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <DataCard>
                <div className="p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <Gift className="h-5 w-5 text-amplifi-lime" />
                  </div>
                  <MetricDisplay
                    value={stats?.claimableRewards || "0"}
                    label="Claimable Rewards"
                    suffix=" SOL"
                    accent="lime"
                    size="lg"
                  />
                </div>
              </DataCard>
              <DataCard>
                <div className="p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <TrendingUp className="h-5 w-5 text-amplifi-purple" />
                  </div>
                  <MetricDisplay
                    value={stats?.totalEarned || "0"}
                    label="Total Earned"
                    suffix=" SOL"
                    accent="purple"
                    size="lg"
                  />
                </div>
              </DataCard>
              <DataCard>
                <div className="p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <Target className="h-5 w-5 text-amplifi-teal" />
                  </div>
                  <MetricDisplay
                    value={stats?.activeCampaigns?.toString() || "0"}
                    label="Active Campaigns"
                    accent="teal"
                    size="lg"
                  />
                </div>
              </DataCard>
              <DataCard>
                <div className="p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <Users className="h-5 w-5 text-foreground-secondary" />
                  </div>
                  <MetricDisplay
                    value={stats?.totalEngagements?.toString() || "0"}
                    label="Total Engagements"
                    size="lg"
                  />
                </div>
              </DataCard>
            </div>

            {/* Actions */}
            <div className="grid md:grid-cols-2 gap-4 mb-8">
              <DataCard className="hover:border-amplifi-lime/30 transition-all">
                <div className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-white mb-1">Claim Rewards</h3>
                      <p className="text-sm text-foreground-secondary">
                        Claim all your pending rewards from settled epochs.
                      </p>
                    </div>
                    <button className="px-5 py-2.5 rounded-lg bg-amplifi-lime text-dark-bg font-medium hover:bg-amplifi-lime/90 transition-colors">
                      Claim All
                    </button>
                  </div>
                </div>
              </DataCard>
              <Link href="/campaigns">
                <DataCard className="hover:border-amplifi-purple/30 transition-all cursor-pointer h-full">
                  <div className="p-5 h-full">
                    <div className="flex items-center justify-between h-full">
                      <div>
                        <h3 className="text-lg font-semibold text-white mb-1">Join Campaigns</h3>
                        <p className="text-sm text-foreground-secondary">
                          Find new campaigns to participate in and earn rewards.
                        </p>
                      </div>
                      <ArrowRight className="h-5 w-5 text-amplifi-purple" />
                    </div>
                  </div>
                </DataCard>
              </Link>
            </div>

            {/* Reward History */}
            <DataCard>
              <div className="p-5">
                <div className="flex items-center gap-2 mb-5">
                  <History className="h-5 w-5 text-amplifi-lime" />
                  <h3 className="text-lg font-semibold text-white">Reward History</h3>
                </div>
                
                {history.length === 0 ? (
                  <div className="text-center py-10">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-dark-surface mx-auto mb-3">
                      <History className="h-6 w-6 text-foreground-secondary" />
                    </div>
                    <p className="text-foreground-secondary">No rewards claimed yet.</p>
                    <p className="text-sm text-foreground-secondary mt-1">
                      Join campaigns and engage to start earning!
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {history.map((item) => (
                      <div 
                        key={item.id} 
                        className="flex items-center justify-between p-4 rounded-xl bg-dark-surface"
                      >
                        <div>
                          <div className="font-medium text-white">{item.campaignName}</div>
                          <div className="text-sm text-foreground-secondary">
                            Epoch #{item.epochNumber} • {formatDate(item.claimedAt)}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <div className="font-bold text-amplifi-lime">+{item.amount} SOL</div>
                          </div>
                          {item.txSig && (
                            <a
                              href={`https://solscan.io/tx/${item.txSig}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-2 rounded-lg hover:bg-dark-elevated transition-colors"
                            >
                              <ExternalLink className="h-4 w-4 text-foreground-secondary" />
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </DataCard>
          </>
        )}
      </div>
    </div>
  );
}

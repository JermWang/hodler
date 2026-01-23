"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Transaction, VersionedTransaction } from "@solana/web3.js";
import Link from "next/link";
import bs58 from "bs58";
import { 
  ArrowRight, Twitter, Wallet, TrendingUp, Gift, CheckCircle, 
  Zap, Award, BarChart3, Clock, ChevronRight, Users, Star,
  ArrowUpRight, Activity, BookOpen, Copy, RefreshCw, ExternalLink, ChevronLeft, X
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

interface UnifiedClaimable {
  pumpfun: {
    available: boolean;
    pendingLamports: string;
    availableLamports: string;
    thresholdLamports: string;
    thresholdMet: boolean;
    pendingRewardCount: number;
    availableRewardCount: number;
    availableEpochIds: string[];
  };
  totalClaimableLamports: string;
  totalClaimableSol: number;
}

const HOLDER_INTRO_STORAGE_KEY = "amplifi_holder_dashboard_intro_seen";

function PumpFunLogo({ className }: { className?: string }) {
  return (
    <img 
      src="/branding/pumpfun-logo.png" 
      alt="Pump.fun" 
      className={className}
    />
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

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
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

function safeBigInt(value: unknown): bigint {
  try {
    const s = String(value ?? "0").trim();
    return s ? BigInt(s) : 0n;
  } catch {
    return 0n;
  }
}

type HolderIntroStep = {
  id: number;
  icon: ReactNode;
  title: string;
  subtitle: string;
  visual: ReactNode;
  accent: string;
};

const HOLDER_INTRO_ACCENTS: Record<
  string,
  {
    dot: string;
    panelBorder: string;
    panelBg: string;
    iconBg: string;
    iconText: string;
  }
> = {
  "amplifi-purple": {
    dot: "bg-amplifi-purple",
    panelBorder: "border-amplifi-purple/20",
    panelBg: "bg-amplifi-purple/5",
    iconBg: "bg-amplifi-purple/15",
    iconText: "text-amplifi-purple",
  },
  "amplifi-lime": {
    dot: "bg-amplifi-lime",
    panelBorder: "border-amplifi-lime/20",
    panelBg: "bg-amplifi-lime/5",
    iconBg: "bg-amplifi-lime/15",
    iconText: "text-amplifi-lime",
  },
  "amplifi-teal": {
    dot: "bg-amplifi-teal",
    panelBorder: "border-amplifi-teal/20",
    panelBg: "bg-amplifi-teal/5",
    iconBg: "bg-amplifi-teal/15",
    iconText: "text-amplifi-teal",
  },
};

function EpochsClaimsVisual() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timers = [setTimeout(() => setStep(1), 250), setTimeout(() => setStep(2), 650), setTimeout(() => setStep(3), 1050)];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="space-y-2 w-full">
        {["Epoch runs", "You earn points", "Epoch settles"].map((label, i) => (
          <div
            key={label}
            className={cn(
              "flex items-center justify-between bg-dark-card border border-dark-border rounded-lg px-3 py-2 transition-all duration-300",
              step > i ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4"
            )}
          >
            <span className="text-sm text-foreground-secondary">{label}</span>
            {i === 1 ? <span className="text-sm font-medium text-amplifi-lime">+score</span> : <span className="text-sm font-medium text-white">{i === 0 ? "live" : "done"}</span>}
          </div>
        ))}
      </div>

      <div
        className={cn(
          "flex items-center gap-2 bg-gradient-to-r from-amplifi-lime/20 to-amplifi-teal/20 border border-amplifi-lime/30 rounded-xl px-4 py-3 transition-all duration-500",
          step >= 3 ? "opacity-100 scale-100" : "opacity-0 scale-95"
        )}
      >
        <Gift className="h-5 w-5 text-amplifi-lime" />
        <div>
          <div className="text-sm font-semibold text-white">Rewards become claimable</div>
          <div className="text-xs text-amplifi-lime">Claim anytime after settlement</div>
        </div>
      </div>
    </div>
  );
}

function HolderIntroModal(input: {
  open: boolean;
  registration: HolderRegistration | null;
  onClose: () => void;
  onConnectTwitter: () => void;
}) {
  const { open, registration, onClose, onConnectTwitter } = input;
  const [currentStep, setCurrentStep] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  const steps = useMemo<HolderIntroStep[]>(() => {
    const twitterStep: HolderIntroStep = {
      id: 1,
      icon: <Twitter className="h-5 w-5" />,
      title: "Verify your X account",
      subtitle: "Connect X so we can attribute your tweet-level engagement and pay you correctly.",
      visual: (
        <div className="flex flex-col items-center gap-4">
          <div
            className={cn(
              "bg-dark-card border rounded-xl p-4 w-full transition-all duration-500 hover-shimmer",
              registration ? "border-amplifi-lime/40 shadow-lg shadow-amplifi-lime/10" : "border-dark-border"
            )}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amplifi-purple/20">
                <Twitter className="h-5 w-5 text-amplifi-purple" />
              </div>
              <div>
                <div className="font-semibold text-white">X Connection</div>
                <div className="text-xs text-foreground-secondary">
                  {registration ? `@${registration.twitterUsername}` : "Not connected"}
                </div>
              </div>
              {registration ? <CheckCircle className="h-5 w-5 text-amplifi-lime ml-auto" /> : null}
            </div>
            {!registration ? (
              <button
                onClick={onConnectTwitter}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-amplifi-purple text-white text-sm font-semibold hover:bg-amplifi-purple-dark transition-colors"
              >
                <Twitter className="h-4 w-4" />
                Connect X Account
              </button>
            ) : (
              <div className="text-xs text-foreground-secondary">You’re ready to earn on AmpliFi campaigns.</div>
            )}
          </div>

          <div className="flex items-start gap-2 p-3 rounded-lg bg-amplifi-purple/10 border border-amplifi-purple/20">
            <CheckCircle className="h-4 w-4 text-amplifi-purple mt-0.5 flex-shrink-0" />
            <p className="text-xs text-foreground-secondary">
              <span className="text-amplifi-purple font-medium">Verified accounts only.</span> We require X Premium verification to reduce bots and protect reward quality.
            </p>
          </div>
        </div>
      ),
      accent: "amplifi-purple",
    };

    const epochsStep: HolderIntroStep = {
      id: 2,
      icon: <Clock className="h-5 w-5" />,
      title: "How epochs & claims work",
      subtitle: "You earn engagement score during an epoch. After it settles, rewards show up as claimable SOL.",
      visual: (
        <div className="flex flex-col items-center gap-4">
          <EpochsClaimsVisual />
          <div className="w-full rounded-xl border border-dark-border bg-dark-elevated/30 p-4">
            <div className="text-sm font-semibold text-white mb-2">What you do</div>
            <div className="space-y-1 text-xs text-foreground-secondary">
              <div>1) Join campaigns</div>
              <div>2) Tweet/reply/retweet/quote with the tracked handles/tags</div>
              <div>3) Claim rewards after settlement</div>
            </div>
            <button
              onClick={() => {
                onClose();
                setTimeout(() => {
                  const el = document.getElementById("claimable-rewards");
                  el?.scrollIntoView({ behavior: "smooth", block: "start" });
                }, 50);
              }}
              className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-amplifi-lime text-dark-bg text-sm font-semibold hover:bg-amplifi-lime-dark transition-colors"
            >
              <Gift className="h-4 w-4" />
              View claimable rewards
            </button>
          </div>
        </div>
      ),
      accent: "amplifi-lime",
    };

    return [twitterStep, epochsStep];
  }, [registration, onConnectTwitter, onClose]);

  useEffect(() => {
    if (open) setCurrentStep(0);
  }, [open]);

  const step = steps[currentStep];
  const stepAccent = HOLDER_INTRO_ACCENTS[step.accent] ?? HOLDER_INTRO_ACCENTS["amplifi-lime"];
  if (!open) return null;

  const go = (dir: -1 | 1) => {
    if (isAnimating) return;
    const next = currentStep + dir;
    if (next < 0 || next >= steps.length) return;
    setIsAnimating(true);
    setTimeout(() => {
      setCurrentStep(next);
      setIsAnimating(false);
    }, 180);
  };

  const primaryAction = () => {
    if (currentStep < steps.length - 1) {
      go(1);
      return;
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative bg-dark-elevated border border-dark-border rounded-2xl p-6 md:p-8 w-full max-w-2xl mx-4 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-foreground-muted hover:text-white transition-colors"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="text-xs text-foreground-muted">Holder Dashboard</div>
            <div className="text-2xl font-bold text-white">Welcome to AmpliFi</div>
          </div>
          <div className="flex items-center gap-2">
            {steps.map((s, i) => (
              (() => {
                const a = HOLDER_INTRO_ACCENTS[s.accent] ?? HOLDER_INTRO_ACCENTS["amplifi-lime"];
                return (
              <div
                key={s.id}
                className={cn(
                  "h-2 w-2 rounded-full transition-all duration-300",
                  i === currentStep ? a.dot : "bg-dark-border"
                )}
              />
                );
              })()
            ))}
          </div>
        </div>

        <div className="grid md:grid-cols-[280px_1fr] gap-6">
          <div className={cn("rounded-2xl border p-5", stepAccent.panelBorder, stepAccent.panelBg)}>
            <div className={cn("flex h-12 w-12 items-center justify-center rounded-2xl mb-4", stepAccent.iconBg, stepAccent.iconText)}>
              {step.icon}
            </div>
            <div className="text-lg font-semibold text-white mb-2">{step.title}</div>
            <div className="text-sm text-foreground-secondary">{step.subtitle}</div>
          </div>

          <div className={cn("transition-all duration-300", isAnimating ? "opacity-0 translate-x-2" : "opacity-100 translate-x-0")}>
            {step.visual}
          </div>
        </div>

        <div className="flex items-center justify-between mt-6">
          <button
            onClick={() => go(-1)}
            disabled={currentStep === 0 || isAnimating}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-dark-border text-white/80 hover:text-white hover:bg-dark-card transition-colors disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>

          <button
            onClick={primaryAction}
            disabled={isAnimating}
            className={cn(
              "inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold transition-colors",
              currentStep === steps.length - 1
                ? "bg-amplifi-lime text-dark-bg hover:bg-amplifi-lime-dark"
                : "bg-amplifi-purple text-white hover:bg-amplifi-purple-dark"
            )}
          >
            {currentStep === steps.length - 1 ? "Got it" : "Next"}
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function HolderDashboard() {
  const { publicKey, connected, signMessage, signTransaction } = useWallet();
  const { connection } = useConnection();
  
  const [registration, setRegistration] = useState<HolderRegistration | null>(null);
  const [stats, setStats] = useState<HolderStats | null>(null);
  const [rewards, setRewards] = useState<ClaimableReward[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTwitterPrompt, setShowTwitterPrompt] = useState(false);
  
  // Unified claimable state
  const [unifiedClaimable, setUnifiedClaimable] = useState<UnifiedClaimable | null>(null);
  
  // Pump.fun claim state  
  const [pumpfunClaimLoading, setPumpfunClaimLoading] = useState(false);
  const [pumpfunClaimError, setPumpfunClaimError] = useState<string | null>(null);
  const [pumpfunClaimSig, setPumpfunClaimSig] = useState<string | null>(null);

  const [unlinkLoading, setUnlinkLoading] = useState(false);
  const [unlinkError, setUnlinkError] = useState<string | null>(null);

  const walletPubkey = useMemo(() => publicKey?.toBase58() ?? "", [publicKey]);

  const markHolderIntroSeen = useCallback(() => {
    try {
      localStorage.setItem(HOLDER_INTRO_STORAGE_KEY, "1");
    } catch {
    }
  }, []);

  const hasSeenHolderIntro = useCallback(() => {
    try {
      return localStorage.getItem(HOLDER_INTRO_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  }, []);

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

  // Handle Pump.fun claim
  const handlePumpfunClaim = useCallback(async () => {
    if (!walletPubkey || !signTransaction) return;
    
    setPumpfunClaimError(null);
    setPumpfunClaimSig(null);
    setPumpfunClaimLoading(true);

    try {
      // Get claim transaction
      const res = await fetch(`/api/holder/rewards/claim?wallet=${walletPubkey}`);
      const json = await res.json().catch(() => null);
      
      if (!res.ok) {
        const e = String(json?.error || "Failed to get claim transaction");
        const hint = typeof json?.hint === "string" ? json.hint.trim() : "";
        setPumpfunClaimError(hint ? `${e} ${hint}` : e);
        return;
      }

      const txBase64 = String(json?.transaction ?? "").trim();
      if (!txBase64) {
        setPumpfunClaimError("No rewards to claim");
        return;
      }

      const tx = decodeTxFromBase64(txBase64);
      const signedTx = await signTransaction(tx as any);
      const raw = signedTx.serialize();
      const signedTransaction = bytesToBase64(Uint8Array.from(raw));
      const epochIds = Array.isArray(json?.epochIds) ? json.epochIds : [];

      // Confirm the claim server-side (records reward_claims)
      const postRes = await fetch("/api/holder/rewards/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signedTransaction, walletPubkey, epochIds }),
      });

      const postJson = await postRes.json().catch(() => null);
      if (!postRes.ok) {
        setPumpfunClaimError(String(postJson?.error || "Claim failed"));
        return;
      }

      const sig = String(postJson?.txSig ?? "").trim();
      if (!sig) {
        setPumpfunClaimError("Claim submitted but missing transaction signature");
        return;
      }

      setPumpfunClaimSig(sig);
      await refreshClaimable();
    } catch (e) {
      setPumpfunClaimError(e instanceof Error ? e.message : "Claim failed");
    } finally {
      setPumpfunClaimLoading(false);
    }
  }, [walletPubkey, signTransaction, refreshClaimable]);

  const handleUnlinkTwitter = useCallback(async () => {
    if (!publicKey || !signMessage) return;
    const walletPubkey = publicKey.toBase58();

    if (!confirm("This will unlink your X account from this wallet. You will stop earning until you reconnect. Continue?")) {
      return;
    }

    setUnlinkError(null);
    setUnlinkLoading(true);
    try {
      const timestampUnix = Math.floor(Date.now() / 1000);
      const msg = `AmpliFi\nUnlink Twitter\nWallet: ${walletPubkey}\nTimestamp: ${timestampUnix}`;
      const sigBytes = await signMessage(new TextEncoder().encode(msg));
      const signatureB58 = bs58.encode(sigBytes);

      const res = await fetch("/api/holder/unlink-twitter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletPubkey, signatureB58, timestampUnix }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setUnlinkError(String(json?.error || "Failed to unlink"));
        return;
      }

      setRegistration(null);
      setShowTwitterPrompt(true);
      setPumpfunClaimError(null);
      setPumpfunClaimSig(null);
      await refreshClaimable();
    } catch (e) {
      setUnlinkError(e instanceof Error ? e.message : "Failed to unlink");
    } finally {
      setUnlinkLoading(false);
    }
  }, [publicKey, signMessage, refreshClaimable]);

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
          setShowTwitterPrompt(false);
        } else {
          setRegistration(null);
          if (!hasSeenHolderIntro()) {
            setShowTwitterPrompt(true);
          }
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
      {showTwitterPrompt && (
        <HolderIntroModal
          open={showTwitterPrompt}
          registration={registration}
          onConnectTwitter={handleConnectTwitter}
          onClose={() => {
            markHolderIntroSeen();
            setShowTwitterPrompt(false);
          }}
        />
      )}

      <div className="mx-auto max-w-[1280px] px-4 md:px-6 pt-20 md:pt-28 pb-10 md:pb-16">
        {/* Header with wallet info */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 mb-10">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl md:text-3xl font-bold text-white">Dashboard</h1>
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

          {registration && (
            <div className="flex flex-col items-end gap-2">
              <button
                onClick={handleUnlinkTwitter}
                disabled={unlinkLoading}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 text-white/80 font-medium hover:bg-white/15 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {unlinkLoading ? "Unlinking..." : "Unlink X"}
              </button>
              {unlinkError ? <div className="text-xs text-red-400 max-w-[280px] text-right">{unlinkError}</div> : null}
            </div>
          )}
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <DataCard variant="elevated" className="p-3 md:p-5">
            <MetricDisplay
              value={stats ? lamportsToSol(stats.totalEarned) : "0.00"}
              label="Total Earned"
              suffix=" SOL"
              size="md"
              accent="lime"
            />
          </DataCard>
          <DataCard variant="elevated" className="p-3 md:p-5">
            <MetricDisplay
              value={stats ? lamportsToSol(stats.totalPending) : "0.00"}
              label="Pending Rewards"
              suffix=" SOL"
              size="md"
              accent="teal"
            />
          </DataCard>
          <DataCard variant="elevated" className="p-3 md:p-5">
            <MetricDisplay
              value={stats?.campaignsJoined.toString() || "0"}
              label="Active Campaigns"
              size="md"
            />
          </DataCard>
          <DataCard variant="elevated" className="p-3 md:p-5">
            <MetricDisplay
              value={stats?.totalEngagements.toString() || "0"}
              label="Total Engagements"
              size="md"
            />
          </DataCard>
        </div>

        {/* Unified Claimable Section */}
        <div id="claimable-rewards" className="mb-8">
          <DataCard>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
              <div>
                <h2 className="text-xl font-bold text-white">Claimable Rewards</h2>
                <p className="text-sm text-foreground-secondary mt-1">
                  Available: {(unifiedClaimable?.totalClaimableSol ?? 0).toFixed(4)} SOL
                </p>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
            {/* Pump.fun Rewards Card */}
            <div className="rounded-xl border border-dark-border bg-dark-elevated/30 p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <PumpFunLogo className="h-10 w-10 rounded-lg" />
                  <div>
                    <div className="font-semibold text-white">Pump.fun Campaigns</div>
                    <div className="text-xs text-foreground-secondary">
                      {unifiedClaimable?.pumpfun.pendingRewardCount || 0} pending
                      {unifiedClaimable?.pumpfun.availableRewardCount ? `, ${unifiedClaimable.pumpfun.availableRewardCount} available` : ""}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold text-amplifi-lime">
                    {lamportsToSol(unifiedClaimable?.pumpfun.availableLamports ?? "0")}
                  </div>
                  <div className="text-xs text-foreground-secondary">SOL</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="rounded-lg bg-dark-elevated/50 p-3">
                  <div className="text-xs text-foreground-secondary mb-1">Pending</div>
                  <div className="text-sm font-semibold text-white">
                    {lamportsToSol(unifiedClaimable?.pumpfun.pendingLamports ?? "0")} SOL
                  </div>
                </div>
                <div className="rounded-lg bg-dark-elevated/50 p-3">
                  <div className="text-xs text-foreground-secondary mb-1">Available</div>
                  <div className="text-sm font-semibold text-white">
                    {lamportsToSol(unifiedClaimable?.pumpfun.availableLamports ?? "0")} SOL
                  </div>
                </div>
              </div>

              {(() => {
                const pending = safeBigInt(unifiedClaimable?.pumpfun.pendingLamports);
                const threshold = safeBigInt(unifiedClaimable?.pumpfun.thresholdLamports);
                const available = safeBigInt(unifiedClaimable?.pumpfun.availableLamports);
                const pct = threshold > 0n ? Math.min(1, Number(pending) / Number(threshold)) : 0;
                const pctText = `${Math.round(pct * 100)}%`;

                if (threshold <= 0n) return null;

                return (
                  <div className="mb-4">
                    <div className="flex items-center justify-between text-xs text-foreground-secondary mb-2">
                      <span>Unlock progress</span>
                      <span>
                        {lamportsToSol(String(pending))} / {lamportsToSol(String(threshold))} SOL ({pctText})
                      </span>
                    </div>
                    <div className="h-2 rounded bg-dark-border overflow-hidden">
                      <div
                        className="h-full bg-amplifi-lime"
                        style={{ width: `${Math.max(0, Math.min(100, pct * 100))}%` }}
                      />
                    </div>
                    {available === 0n ? (
                      <div className="text-xs text-foreground-secondary mt-2">
                        Rewards unlock at 0.10 SOL pending, or when a campaign ends.
                      </div>
                    ) : null}
                  </div>
                );
              })()}

              {pumpfunClaimError && (
                <div className="text-xs text-red-400 mb-3 p-2 rounded bg-red-500/10">{pumpfunClaimError}</div>
              )}
              {pumpfunClaimSig && (
                <div className="text-xs text-foreground-secondary mb-3">
                  <a href={solscanTxUrl(pumpfunClaimSig)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-amplifi-lime hover:underline">
                    <ExternalLink className="h-3 w-3" />
                    View transaction
                  </a>
                </div>
              )}

              <button
                onClick={handlePumpfunClaim}
                disabled={
                  pumpfunClaimLoading ||
                  safeBigInt(unifiedClaimable?.pumpfun.availableLamports) === 0n
                }
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-amplifi-lime text-dark-bg text-sm font-semibold hover:bg-amplifi-lime-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Gift className="h-4 w-4" />
                {pumpfunClaimLoading ? "Claiming..." : "Claim Pump.fun Rewards"}
              </button>
            </div>
          </div>
          </DataCard>
        </div>

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

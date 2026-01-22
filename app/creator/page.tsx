"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import bs58 from "bs58";
import { Transaction, VersionedTransaction } from "@solana/web3.js";
import {
  Activity,
  ArrowRight,
  ExternalLink,
  Gift,
  RefreshCw,
  Shield,
  TrendingUp,
  Wallet,
  Rocket,
  Sparkles,
  Coins,
  Zap,
} from "lucide-react";

import { DataCard, DataCardHeader, MetricDisplay } from "@/app/components/ui/data-card";
import { StatusBadge } from "@/app/components/ui/activity-feed";
import { cn } from "@/app/lib/utils";

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

function PumpFunLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className}>
      <rect width="32" height="32" rx="8" fill="#0a0a0a"/>
      <path d="M16 6l8 5v10l-8 5-8-5V11l8-5z" fill="#39ff14" fillOpacity="0.2"/>
      <path d="M16 8l6 3.75v7.5L16 23l-6-3.75v-7.5L16 8z" stroke="#39ff14" strokeWidth="1.5"/>
      <path d="M13 15l2 2 4-4" stroke="#39ff14" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function LaunchCTAAnimation() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setStep(1), 300),
      setTimeout(() => setStep(2), 800),
      setTimeout(() => setStep(3), 1300),
      setTimeout(() => setStep(4), 1800),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Animated rocket */}
      <div className="relative">
        <div
          className={cn(
            "relative z-10 flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-amplifi-purple via-amplifi-teal to-amplifi-lime transition-all duration-700",
            step >= 1 ? "scale-100 opacity-100" : "scale-50 opacity-0"
          )}
        >
          <Rocket className={cn(
            "h-12 w-12 text-white transition-all duration-500",
            step >= 2 ? "animate-bounce" : ""
          )} />
        </div>
        
        {/* Orbiting particles */}
        <div className={cn(
          "absolute -inset-4 transition-all duration-700",
          step >= 2 ? "opacity-100" : "opacity-0"
        )}>
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-2">
            <Sparkles className="h-5 w-5 text-amplifi-lime animate-pulse" />
          </div>
          <div className="absolute bottom-0 right-0 translate-x-2 translate-y-2">
            <Coins className="h-4 w-4 text-amplifi-purple animate-pulse" style={{ animationDelay: "0.3s" }} />
          </div>
          <div className="absolute bottom-0 left-0 -translate-x-2 translate-y-2">
            <Zap className="h-4 w-4 text-amplifi-teal animate-pulse" style={{ animationDelay: "0.6s" }} />
          </div>
        </div>
      </div>

      {/* Animated text */}
      <div className="text-center space-y-3">
        <h2 className={cn(
          "text-2xl font-bold text-white transition-all duration-500",
          step >= 3 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        )}>
          Ready to launch your token?
        </h2>
        <p className={cn(
          "text-foreground-secondary max-w-sm transition-all duration-500",
          step >= 3 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        )} style={{ transitionDelay: "100ms" }}>
          Create your own token with built-in holder rewards. Get 50% of all trading fees distributed to your community.
        </p>
      </div>

      {/* Animated benefits */}
      <div className={cn(
        "grid grid-cols-3 gap-4 w-full max-w-md transition-all duration-500",
        step >= 4 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
      )}>
        {[
          { icon: <Sparkles className="h-5 w-5" />, label: "Vanity CA", color: "lime" },
          { icon: <Coins className="h-5 w-5" />, label: "Auto Rewards", color: "purple" },
          { icon: <Zap className="h-5 w-5" />, label: "Instant Setup", color: "teal" },
        ].map((item, i) => (
          <div
            key={item.label}
            className={cn(
              "flex flex-col items-center gap-2 p-3 rounded-xl bg-dark-elevated/50 border border-dark-border/50 transition-all duration-300",
              `hover:border-amplifi-${item.color}/30`
            )}
            style={{ transitionDelay: `${i * 100}ms` }}
          >
            <div className={cn(
              "text-amplifi-" + item.color
            )} style={{ color: item.color === "lime" ? "#B6F04A" : item.color === "purple" ? "#8B5CF6" : "#14B8A6" }}>
              {item.icon}
            </div>
            <span className="text-xs text-foreground-secondary font-medium">{item.label}</span>
          </div>
        ))}
      </div>

      {/* CTA Button */}
      <Link
        href="/launch"
        className={cn(
          "group inline-flex items-center gap-3 px-8 py-4 rounded-2xl bg-gradient-to-r from-amplifi-lime to-amplifi-teal text-dark-bg font-bold text-lg hover:shadow-[0_0_32px_rgba(182,240,74,0.3)] transition-all duration-500",
          step >= 4 ? "opacity-100 scale-100" : "opacity-0 scale-95"
        )}
        style={{ transitionDelay: "200ms" }}
      >
        <Rocket className="h-5 w-5 group-hover:-translate-y-1 group-hover:translate-x-1 transition-transform" />
        Launch Your Token
        <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
      </Link>
    </div>
  );
}

function CreatorEmptyState() {
  return (
    <div 
      className="relative rounded-2xl overflow-hidden hover-shimmer"
      style={{ 
        "--shimmer-bg": "#0b0c0e", 
        "--shimmer-radius": "16px" 
      } as React.CSSProperties}
    >
      <div className="relative z-10 bg-dark-bg rounded-2xl border border-dark-border/40 py-16 px-8">
        <LaunchCTAAnimation />
      </div>
    </div>
  );
}

function lamportsToSol(lamports: string | number): string {
  const raw = typeof lamports === "number" ? String(Math.floor(lamports)) : String(lamports ?? "0").trim();
  let v = 0n;
  try {
    v = BigInt(raw || "0");
  } catch {
    v = 0n;
  }
  const sol = Number(v) / 1e9;
  return sol.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}

function solscanTxUrl(sig: string): string {
  const s = String(sig ?? "").trim();
  if (!s) return "";
  const base = `https://solscan.io/tx/${encodeURIComponent(s)}`;
  const c = String(process.env.NEXT_PUBLIC_SOLANA_CLUSTER || "mainnet-beta").trim();
  if (!c || c === "mainnet-beta") return base;
  return `${base}?cluster=${encodeURIComponent(c)}`;
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

function statusBadgeForCommitment(status: string): "active" | "pending" | "completed" {
  const s = String(status ?? "").trim();
  if (s === "active") return "active";
  if (s === "completed" || s === "resolved_success") return "completed";
  return "pending";
}

export default function CreatorDashboardPage() {
  const { publicKey, connected, signMessage, sendTransaction } = useWallet();
  const { connection } = useConnection();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any | null>(null);

  const [bagsLoading, setBagsLoading] = useState(false);
  const [bagsError, setBagsError] = useState<string | null>(null);
  const [bagsStatus, setBagsStatus] = useState<any | null>(null);
  const [bagsClaimSigs, setBagsClaimSigs] = useState<string[]>([]);

  const [pumpfunLoading, setPumpfunLoading] = useState(false);
  const [pumpfunError, setPumpfunError] = useState<string | null>(null);
  const [pumpfunClaimSig, setPumpfunClaimSig] = useState<string | null>(null);

  const [sweepBusyById, setSweepBusyById] = useState<Record<string, boolean>>({});
  const [sweepErrorById, setSweepErrorById] = useState<Record<string, string>>({});
  const [sweepSigById, setSweepSigById] = useState<Record<string, string>>({});


  const [devTokenClaimBusyById, setDevTokenClaimBusyById] = useState<Record<string, boolean>>({});
  const [devTokenClaimErrorById, setDevTokenClaimErrorById] = useState<Record<string, string>>({});
  const [devTokenClaimSigById, setDevTokenClaimSigById] = useState<Record<string, string>>({});
  const [devTokenPercentById, setDevTokenPercentById] = useState<Record<string, number>>({});
  const [devTokenCustomById, setDevTokenCustomById] = useState<Record<string, string>>({});

  const walletPubkey = useMemo(() => publicKey?.toBase58() ?? "", [publicKey]);

  const refreshCreator = useCallback(async () => {
    if (!walletPubkey) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/creator/${encodeURIComponent(walletPubkey)}`);
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(String(json?.error || "Failed to load creator dashboard"));
        setData(null);
        return;
      }
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load creator dashboard");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [walletPubkey]);

  const refreshBagsStatus = useCallback(async () => {
    if (!walletPubkey) return;
    try {
      const res = await fetch("/api/bags/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletPubkey }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setBagsStatus(null);
        setBagsError(String(json?.error || "Failed to load Bags fees"));
        return;
      }
      setBagsStatus(json);
      setBagsError(null);
    } catch (e) {
      setBagsStatus(null);
      setBagsError(e instanceof Error ? e.message : "Failed to load Bags fees");
    }
  }, [walletPubkey]);

  useEffect(() => {
    if (!connected || !walletPubkey) {
      setLoading(false);
      setError(null);
      setData(null);
      return;
    }

    void refreshCreator();
    void refreshBagsStatus();
  }, [connected, walletPubkey, refreshCreator, refreshBagsStatus]);

  const handleBagsClaim = useCallback(async () => {
    setBagsError(null);
    setBagsClaimSigs([]);

    if (!walletPubkey) {
      setBagsError("Wallet not connected");
      return;
    }
    if (!signMessage) {
      setBagsError("Wallet must support message signing");
      return;
    }

    try {
      setBagsLoading(true);
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
        setBagsError(String(json?.error || "Bags claim failed"));
        return;
      }

      const txs: string[] = Array.isArray(json?.transactions) ? json.transactions : [];
      if (txs.length === 0) {
        await refreshBagsStatus();
        return;
      }

      if (typeof sendTransaction !== "function") {
        setBagsError("Wallet does not support sending transactions");
        return;
      }

      const sigs: string[] = [];
      for (const txBase64 of txs) {
        const tx = decodeTxFromBase64(String(txBase64));
        const sig = await sendTransaction(tx, connection, { preflightCommitment: "confirmed" });
        sigs.push(sig);
      }

      setBagsClaimSigs(sigs);
      await refreshBagsStatus();
    } catch (e) {
      setBagsError(e instanceof Error ? e.message : "Bags claim failed");
    } finally {
      setBagsLoading(false);
    }
  }, [walletPubkey, signMessage, sendTransaction, connection, refreshBagsStatus]);

  const handlePumpfunClaim = useCallback(async () => {
    setPumpfunError(null);
    setPumpfunClaimSig(null);

    if (!walletPubkey) {
      setPumpfunError("Wallet not connected");
      return;
    }
    if (!signMessage) {
      setPumpfunError("Wallet must support message signing");
      return;
    }
    if (typeof sendTransaction !== "function") {
      setPumpfunError("Wallet does not support sending transactions");
      return;
    }

    try {
      setPumpfunLoading(true);
      const timestampUnix = Math.floor(Date.now() / 1000);
      const msg = `AmpliFi\nPump.fun Claim\nCreator: ${walletPubkey}\nTimestamp: ${timestampUnix}`;
      const sigBytes = await signMessage(new TextEncoder().encode(msg));
      const signatureB58 = bs58.encode(sigBytes);

      const res = await fetch("/api/pumpfun/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creatorPubkey: walletPubkey, timestampUnix, signatureB58 }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setPumpfunError(String(json?.error || "Pump.fun claim failed"));
        return;
      }

      const txBase64 = String(json?.txBase64 ?? "").trim();
      if (!txBase64) {
        setPumpfunError("No transaction returned");
        return;
      }

      const tx = decodeTxFromBase64(txBase64);
      const sig = await sendTransaction(tx, connection, { preflightCommitment: "confirmed" });
      setPumpfunClaimSig(sig);
    } catch (e) {
      setPumpfunError(e instanceof Error ? e.message : "Pump.fun claim failed");
    } finally {
      setPumpfunLoading(false);
    }
  }, [walletPubkey, signMessage, sendTransaction, connection]);

  const handleSweepToEscrow = useCallback(
    async (commitmentId: string) => {
      if (!walletPubkey) {
        setSweepErrorById((p) => ({ ...p, [commitmentId]: "Wallet not connected" }));
        return;
      }
      if (!signMessage) {
        setSweepErrorById((p) => ({ ...p, [commitmentId]: "Wallet must support message signing" }));
        return;
      }

      setSweepErrorById((p) => {
        const next = { ...p };
        delete next[commitmentId];
        return next;
      });

      try {
        setSweepBusyById((p) => ({ ...p, [commitmentId]: true }));
        const timestampUnix = Math.floor(Date.now() / 1000);
        const msg = `Commit To Ship\nEscrow Sweep\nCommitment: ${commitmentId}\nTimestamp: ${timestampUnix}`;
        const sigBytes = await signMessage(new TextEncoder().encode(msg));
        const signatureB58 = bs58.encode(sigBytes);

        const res = await fetch(`/api/commitments/${encodeURIComponent(commitmentId)}/escrow/sweep`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ timestampUnix, signatureB58 }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          setSweepErrorById((p) => ({ ...p, [commitmentId]: String(json?.error || "Sweep failed") }));
          return;
        }

        const sig = String(json?.result?.pumpportal?.signature ?? json?.result?.pumpfun?.signature ?? json?.result?.signature ?? "").trim();
        if (sig) {
          setSweepSigById((p) => ({ ...p, [commitmentId]: sig }));
        }

        await refreshCreator();
      } catch (e) {
        setSweepErrorById((p) => ({ ...p, [commitmentId]: e instanceof Error ? e.message : "Sweep failed" }));
      } finally {
        setSweepBusyById((p) => ({ ...p, [commitmentId]: false }));
      }
    },
    [walletPubkey, signMessage, refreshCreator]
  );

  const handleDevTokenClaim = useCallback(
    async (commitmentId: string, percentage: number) => {
      if (!walletPubkey) {
        setDevTokenClaimErrorById((p) => ({ ...p, [commitmentId]: "Wallet not connected" }));
        return;
      }
      if (!signMessage) {
        setDevTokenClaimErrorById((p) => ({ ...p, [commitmentId]: "Wallet must support message signing" }));
        return;
      }

      setDevTokenClaimErrorById((p) => {
        const next = { ...p };
        delete next[commitmentId];
        return next;
      });

      try {
        setDevTokenClaimBusyById((p) => ({ ...p, [commitmentId]: true }));
        const timestampUnix = Math.floor(Date.now() / 1000);
        const msg = `AmpliFi\nCreator Auth\nAction: claim_dev_tokens\nWallet: ${walletPubkey}\nTimestamp: ${timestampUnix}`;
        const sigBytes = await signMessage(new TextEncoder().encode(msg));
        const signatureB58 = bs58.encode(sigBytes);

        const res = await fetch(`/api/creator/${encodeURIComponent(walletPubkey)}/claim-dev-tokens`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            commitmentId,
            percentage,
            creatorAuth: { walletPubkey, signatureB58, timestampUnix },
          }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          setDevTokenClaimErrorById((p) => ({ ...p, [commitmentId]: String(json?.error || "Claim failed") }));
          return;
        }

        const sig = String(json?.txSig ?? "").trim();
        if (sig) {
          setDevTokenClaimSigById((p) => ({ ...p, [commitmentId]: sig }));
        }

        setDevTokenPercentById((p) => {
          const next = { ...p };
          delete next[commitmentId];
          return next;
        });
        setDevTokenCustomById((p) => {
          const next = { ...p };
          delete next[commitmentId];
          return next;
        });

        await refreshCreator();
      } catch (e) {
        setDevTokenClaimErrorById((p) => ({ ...p, [commitmentId]: e instanceof Error ? e.message : "Claim failed" }));
      } finally {
        setDevTokenClaimBusyById((p) => ({ ...p, [commitmentId]: false }));
      }
    },
    [walletPubkey, signMessage, refreshCreator]
  );

  if (!connected) {
    return (
      <div className="min-h-screen bg-dark-bg">
        <div className="mx-auto max-w-[1280px] px-6 pt-32 pb-16">
          <div className="flex flex-col items-center justify-center text-center py-20">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-amplifi-lime/10 mb-6">
              <Wallet className="h-10 w-10 text-amplifi-lime" />
            </div>
            <h1 className="text-4xl font-bold text-white mb-4">Connect Your Wallet</h1>
            <p className="text-lg text-foreground-secondary mb-8 max-w-md">
              Connect your Solana wallet to view your creator earnings, claim trading fees, and track campaign performance.
            </p>
            <WalletMultiButton />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-bg">
      <div className="mx-auto max-w-[1280px] px-6 pt-28 pb-16">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 mb-10">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold text-white">Creator Dashboard</h1>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2 text-foreground-secondary">
                <Wallet className="h-4 w-4" />
                <span className="font-mono">{walletPubkey.slice(0, 6)}...{walletPubkey.slice(-4)}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                void refreshCreator();
                void refreshBagsStatus();
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-dark-border text-white text-sm font-medium hover:bg-dark-elevated transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
            <Link
              href="/holder"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amplifi-lime text-dark-bg text-sm font-semibold hover:bg-amplifi-lime-dark transition-colors"
            >
              Raider view
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-200 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amplifi-lime"></div>
          </div>
        ) : !data?.projects || data.projects.length === 0 ? (
          <CreatorEmptyState />
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <DataCard variant="elevated" className="p-5">
                <MetricDisplay
                  value={lamportsToSol(Number(data?.summary?.totalEarnedLamports ?? 0))}
                  label="Total Earned"
                  suffix=" SOL"
                  size="md"
                  accent="lime"
                />
              </DataCard>
              <DataCard variant="elevated" className="p-5">
                <MetricDisplay
                  value={lamportsToSol(Number(data?.summary?.totalClaimableLamports ?? 0))}
                  label="Claimable"
                  suffix=" SOL"
                  size="md"
                  accent="teal"
                />
              </DataCard>
              <DataCard variant="elevated" className="p-5">
                <MetricDisplay
                  value={String(data?.summary?.activeProjects ?? 0)}
                  label="Active Projects"
                  size="md"
                />
              </DataCard>
              <DataCard variant="elevated" className="p-5">
                <MetricDisplay
                  value={String(data?.summary?.totalCampaigns ?? data?.projects?.length ?? 0)}
                  label="Active Campaigns"
                  size="md"
                />
              </DataCard>
            </div>

            <div className="grid lg:grid-cols-3 gap-6 mb-8">
              <DataCard className="lg:col-span-2">
                <DataCardHeader title="Trading Fees" subtitle="Claim your share of trading fees" />
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl bg-dark-elevated/50 p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 mt-0.5">
                        <BagsLogo className="h-10 w-10 rounded-lg" />
                      </div>
                      <div>
                        <div className="text-sm text-foreground-secondary flex items-center gap-2">
                          <span>Bags.fm</span>
                          <a href="https://bags.fm" target="_blank" rel="noopener noreferrer" className="text-amplifi-teal hover:underline text-xs">(bags.fm)</a>
                        </div>
                        <div className="text-xl font-bold text-white">
                          {bagsStatus?.totalClaimableSol != null
                            ? Number(bagsStatus.totalClaimableSol).toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 6,
                              })
                            : "0.00"} SOL
                        </div>
                      </div>
                      {bagsError && <div className="text-xs text-red-400 mt-1">{bagsError}</div>}
                      {bagsClaimSigs.length > 0 && (
                        <div className="text-xs text-foreground-secondary mt-2 space-y-1">
                          {bagsClaimSigs.slice(0, 3).map((sig) => (
                            <a
                              key={sig}
                              href={solscanTxUrl(sig)}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="inline-flex items-center gap-1 hover:underline"
                            >
                              <ExternalLink className="h-3 w-3" />
                              {sig.slice(0, 10)}...{sig.slice(-6)}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleBagsClaim()}
                      disabled={bagsLoading}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-amplifi-lime text-dark-bg text-sm font-semibold hover:bg-amplifi-lime-dark transition-colors disabled:opacity-60"
                    >
                      <Gift className="h-4 w-4" />
                      {bagsLoading ? "Claiming..." : "Claim via Bags"}
                    </button>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl bg-dark-elevated/50 p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 mt-0.5">
                        <PumpFunLogo className="h-10 w-10 rounded-lg" />
                      </div>
                      <div>
                        <div className="text-sm text-foreground-secondary flex items-center gap-2">
                          <span>Pump.fun</span>
                          <a href="https://pump.fun" target="_blank" rel="noopener noreferrer" className="text-amplifi-lime hover:underline text-xs">(pump.fun)</a>
                        </div>
                        <div className="text-xl font-bold text-white">Creator Vault</div>
                        {pumpfunError && <div className="text-xs text-red-400 mt-1">{pumpfunError}</div>}
                        {pumpfunClaimSig && (
                          <div className="text-xs text-foreground-secondary mt-2">
                            <a
                              href={solscanTxUrl(pumpfunClaimSig)}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="inline-flex items-center gap-1 hover:underline"
                            >
                              <ExternalLink className="h-3 w-3" />
                              {pumpfunClaimSig.slice(0, 10)}...{pumpfunClaimSig.slice(-6)}
                            </a>
                          </div>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => void handlePumpfunClaim()}
                      disabled={pumpfunLoading}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-amplifi-purple text-white text-sm font-semibold hover:bg-amplifi-purple-dark transition-colors disabled:opacity-60"
                    >
                      <Shield className="h-4 w-4" />
                      {pumpfunLoading ? "Preparing..." : "Claim Pump.fun"}
                    </button>
                  </div>
                </div>
              </DataCard>

              <DataCard>
                <DataCardHeader title="Activity" subtitle="Recent payouts & sweeps" />
                <div className="space-y-3">
                  {(Array.isArray(data?.projects) ? data.projects : []).slice(0, 1).flatMap((p: any) => {
                    const withdrawals = Array.isArray(p?.withdrawals) ? p.withdrawals : [];
                    const sweeps = Array.isArray(p?.failureTransfers) ? p.failureTransfers : [];
                    return [...withdrawals.slice(0, 2), ...sweeps.slice(0, 2)];
                  }).slice(0, 4).map((e: any, idx: number) => {
                    const sig = String(e?.txSig ?? "").trim();
                    const title = String(e?.title ?? e?.kind ?? "Transaction");
                    const amount = typeof e?.amountLamports === "number" ? `${lamportsToSol(e.amountLamports)} SOL` : "";
                    return (
                      <div key={`${sig || idx}`} className="flex items-center justify-between rounded-xl bg-dark-elevated/50 p-4">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-white truncate">{title}</div>
                          <div className="text-xs text-foreground-secondary truncate">{amount}</div>
                        </div>
                        {sig ? (
                          <a
                            href={solscanTxUrl(sig)}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="inline-flex items-center gap-1 text-sm text-amplifi-lime hover:underline"
                          >
                            View
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        ) : (
                          <div className="text-xs text-foreground-muted">n/a</div>
                        )}
                      </div>
                    );
                  })}

                  {(!data?.projects || data.projects.length === 0) && (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-dark-border mb-4">
                        <Activity className="h-7 w-7 text-foreground-secondary" />
                      </div>
                      <h3 className="text-lg font-semibold text-white mb-2">No projects yet</h3>
                      <p className="text-sm text-foreground-secondary max-w-sm">
                        Launch a token or create a commitment to see creator earnings here.
                      </p>
                      <Link
                        href="/launch"
                        className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-dark-border text-white text-sm font-medium hover:bg-dark-elevated transition-colors"
                      >
                        Launch
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </div>
                  )}
                </div>
              </DataCard>
            </div>

            <DataCard>
              <DataCardHeader title="Your Projects" subtitle="Campaign performance and earnings" />
              <div className="space-y-4">
                {(Array.isArray(data?.projects) ? data.projects : []).map((p: any) => {
                  const commitment = p?.commitment;
                  const projectProfile = p?.projectProfile;
                  const id = String(commitment?.id ?? "").trim();
                  const tokenMint = String(commitment?.tokenMint ?? "").trim();
                  const title = String((projectProfile?.name ?? projectProfile?.tokenName ?? tokenMint) || id);
                  const feeMode = String(commitment?.creatorFeeMode ?? "").trim();
                  const status = String(commitment?.status ?? "").trim();
                  const escrow = p?.escrow || {};
                  const devBuyTokenAmount = String(commitment?.devBuyTokenAmount ?? "").trim();
                  const devBuyTokensClaimed = String(commitment?.devBuyTokensClaimed ?? "0").trim();
                  const totalDevTokens = BigInt(devBuyTokenAmount || "0");
                  const claimedDevTokens = BigInt(devBuyTokensClaimed || "0");
                  const remainingDevTokens = totalDevTokens - claimedDevTokens;
                  const hasDevBuyTokens = remainingDevTokens > 0n;

                  return (
                    <div key={id} className="rounded-2xl border border-dark-border/60 bg-dark-surface/70 p-6">
                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-5">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="text-lg font-semibold text-white truncate">{title}</h3>
                            <StatusBadge status={statusBadgeForCommitment(status)} />
                          </div>
                          {tokenMint && (
                            <div className="text-xs text-foreground-secondary font-mono mt-1">
                              {tokenMint.slice(0, 8)}...{tokenMint.slice(-6)}
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col sm:flex-row gap-2">
                          {feeMode === "managed" && id && (
                            <button
                              type="button"
                              onClick={() => void handleSweepToEscrow(id)}
                              disabled={!!sweepBusyById[id]}
                              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-amplifi-teal text-dark-bg text-sm font-semibold hover:bg-amplifi-teal-dark transition-colors disabled:opacity-60"
                            >
                              <TrendingUp className="h-4 w-4" />
                              {sweepBusyById[id] ? "Sweeping..." : "Sweep to escrow"}
                            </button>
                          )}
                          {sweepSigById[id] && (
                            <a
                              href={solscanTxUrl(sweepSigById[id])}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-dark-border text-white text-sm font-medium hover:bg-dark-elevated transition-colors"
                            >
                              Sweep tx
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          )}
                        </div>
                      </div>

                      {sweepErrorById[id] && (
                        <div className="mb-4 text-xs text-red-200">{sweepErrorById[id]}</div>
                      )}

                      {hasDevBuyTokens && (() => {
                        const totalTokensNum = Number(devBuyTokenAmount) / 1e6;
                        const claimedTokensNum = Number(commitment?.devBuyTokensClaimed ?? "0") / 1e6;
                        const remainingTokensNum = totalTokensNum - claimedTokensNum;
                        const selectedPercent = devTokenPercentById[id] ?? 100;
                        const customValue = devTokenCustomById[id] ?? "";
                        const isCustom = selectedPercent === -1;
                        const effectivePercent = isCustom ? (Number(customValue) || 0) : selectedPercent;
                        const targetClaimed = (totalTokensNum * effectivePercent) / 100;
                        const claimPreview = Math.max(0, targetClaimed - claimedTokensNum);

                        return (
                          <div className="mb-5 rounded-xl bg-amplifi-lime/10 border border-amplifi-lime/30 p-4">
                            <div className="flex flex-col gap-4">
                              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                                <div>
                                  <div className="text-sm font-semibold text-amplifi-lime">Dev Buy Tokens Available</div>
                                  <div className="text-xs text-foreground-secondary mt-1">
                                    {remainingTokensNum.toLocaleString(undefined, { maximumFractionDigits: 2 })} tokens remaining
                                    {claimedTokensNum > 0 && (
                                      <span className="text-foreground-muted"> (claimed {claimedTokensNum.toLocaleString(undefined, { maximumFractionDigits: 2 })})</span>
                                    )}
                                  </div>
                                </div>
                                {devTokenClaimSigById[id] && (
                                  <a
                                    href={solscanTxUrl(devTokenClaimSigById[id])}
                                    target="_blank"
                                    rel="noreferrer noopener"
                                    className="inline-flex items-center gap-1 text-xs text-amplifi-lime hover:underline"
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                    Last claim: {devTokenClaimSigById[id].slice(0, 8)}...
                                  </a>
                                )}
                              </div>

                              <div className="flex flex-wrap items-center gap-2">
                                {[25, 50, 75, 100].map((pct) => (
                                  <button
                                    key={pct}
                                    type="button"
                                    onClick={() => {
                                      setDevTokenPercentById((p) => ({ ...p, [id]: pct }));
                                      setDevTokenCustomById((p) => {
                                        const next = { ...p };
                                        delete next[id];
                                        return next;
                                      });
                                    }}
                                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                                      selectedPercent === pct && !isCustom
                                        ? "bg-amplifi-lime text-dark-bg"
                                        : "bg-dark-elevated text-foreground-secondary hover:bg-dark-border hover:text-white"
                                    }`}
                                  >
                                    {pct}%
                                  </button>
                                ))}
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => setDevTokenPercentById((p) => ({ ...p, [id]: -1 }))}
                                    className={`px-3 py-1.5 rounded-l-lg text-sm font-medium transition-all ${
                                      isCustom
                                        ? "bg-amplifi-lime text-dark-bg"
                                        : "bg-dark-elevated text-foreground-secondary hover:bg-dark-border hover:text-white"
                                    }`}
                                  >
                                    Custom
                                  </button>
                                  {isCustom && (
                                    <div className="flex items-center">
                                      <input
                                        type="number"
                                        min="1"
                                        max="100"
                                        value={customValue}
                                        onChange={(e) => setDevTokenCustomById((p) => ({ ...p, [id]: e.target.value }))}
                                        placeholder="1-100"
                                        className="w-16 px-2 py-1.5 rounded-r-lg bg-dark-elevated border border-dark-border text-white text-sm focus:outline-none focus:border-amplifi-lime"
                                      />
                                      <span className="ml-1 text-sm text-foreground-secondary">%</span>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {effectivePercent > 0 && effectivePercent <= 100 && (
                                <div className="text-xs text-foreground-secondary">
                                  Withdraw: ~{claimPreview.toLocaleString(undefined, { maximumFractionDigits: 2 })} tokens ({effectivePercent}%)
                                </div>
                              )}

                              {devTokenClaimErrorById[id] && (
                                <div className="text-xs text-red-200">{devTokenClaimErrorById[id]}</div>
                              )}

                              <button
                                type="button"
                                onClick={() => void handleDevTokenClaim(id, effectivePercent)}
                                disabled={!!devTokenClaimBusyById[id] || effectivePercent <= 0 || effectivePercent > 100 || claimPreview <= 0}
                                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-amplifi-lime text-dark-bg text-sm font-semibold hover:bg-amplifi-lime-dark transition-colors disabled:opacity-60 w-full sm:w-auto"
                              >
                                <Gift className="h-4 w-4" />
                                {devTokenClaimBusyById[id] ? "Claiming..." : `Withdraw ${effectivePercent}%`}
                              </button>
                            </div>
                          </div>
                        );
                      })()}

                      {!hasDevBuyTokens && devBuyTokenAmount && devBuyTokenAmount !== "0" && (
                        <div className="mb-5 rounded-xl bg-dark-elevated/50 p-4">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <div className="text-sm text-foreground-secondary">
                              All dev buy tokens claimed ({(Number(devBuyTokenAmount) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 })} tokens)
                            </div>
                            {Array.isArray(commitment?.devBuyClaimTxSigs) && commitment.devBuyClaimTxSigs.length > 0 && (
                              <div className="flex flex-wrap gap-2">
                                {commitment.devBuyClaimTxSigs.slice(-3).map((sig: string, i: number) => (
                                  <a
                                    key={sig}
                                    href={solscanTxUrl(sig)}
                                    target="_blank"
                                    rel="noreferrer noopener"
                                    className="inline-flex items-center gap-1 text-xs text-amplifi-lime hover:underline"
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                    tx {commitment.devBuyClaimTxSigs.length > 3 ? i + commitment.devBuyClaimTxSigs.length - 2 : i + 1}
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
                        <DataCard variant="elevated" className="p-4" hover={false}>
                          <MetricDisplay
                            value={lamportsToSol(Number(escrow?.balanceLamports ?? 0))}
                            label="Escrow Balance"
                            suffix=" SOL"
                            size="sm"
                          />
                        </DataCard>
                        <DataCard variant="elevated" className="p-4" hover={false}>
                          <MetricDisplay
                            value={lamportsToSol(Number(escrow?.releasedLamports ?? 0))}
                            label="Released"
                            suffix=" SOL"
                            size="sm"
                            accent="teal"
                          />
                        </DataCard>
                        <DataCard variant="elevated" className="p-4" hover={false}>
                          <MetricDisplay
                            value={lamportsToSol(Number(escrow?.claimableLamports ?? 0))}
                            label="Claimable"
                            suffix=" SOL"
                            size="sm"
                            accent="lime"
                          />
                        </DataCard>
                        <DataCard variant="elevated" className="p-4" hover={false}>
                          <MetricDisplay
                            value={lamportsToSol(Number(escrow?.pendingLamports ?? 0))}
                            label="Pending"
                            suffix=" SOL"
                            size="sm"
                          />
                        </DataCard>
                      </div>

                      {Array.isArray(p?.withdrawals) && p.withdrawals.length > 0 && (
                        <div className="mt-5">
                          <div className="text-sm font-semibold text-white mb-3">Recent payouts</div>
                          <div className="space-y-2">
                            {p.withdrawals.slice(0, 3).map((w: any) => {
                              const sig = String(w?.txSig ?? "").trim();
                              return (
                                <div
                                  key={`${w?.id || "p"}:${sig}`}
                                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl bg-dark-elevated/50 p-3"
                                >
                                  <div className="min-w-0">
                                    <div className="text-sm font-medium text-white truncate">{String(w?.title ?? "Payout")}</div>
                                    <div className="text-xs text-foreground-secondary">
                                      {lamportsToSol(Number(w?.amountLamports ?? 0))} SOL
                                    </div>
                                  </div>
                                  {sig && (
                                    <a
                                      href={solscanTxUrl(sig)}
                                      target="_blank"
                                      rel="noreferrer noopener"
                                      className="inline-flex items-center gap-2 text-sm text-amplifi-lime hover:underline"
                                    >
                                      Solscan
                                      <ExternalLink className="h-4 w-4" />
                                    </a>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </DataCard>
          </>
        )}
      </div>
    </div>
  );
}

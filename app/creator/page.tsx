"use client";

import { useCallback, useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Transaction } from "@solana/web3.js";
import bs58 from "bs58";
import { Coins, RefreshCw, CheckCircle, ExternalLink, AlertCircle, Wallet } from "lucide-react";

import { HodlrLayout } from "@/app/components/hodlr";
import { useToast } from "@/app/components/ToastProvider";

function lamportsToSol(lamports: number): string {
  return (lamports / 1e9).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

interface FeeStatus {
  claimableLamports: number;
  vaultBalanceLamports: number;
  creatorVault: string;
}

export default function CreatorPage() {
  const { connection } = useConnection();
  const { publicKey, signMessage, sendTransaction, connected } = useWallet();
  const { toast } = useToast();

  const [status, setStatus] = useState<FeeStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [lastTxSig, setLastTxSig] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!publicKey) return;
    setLoadingStatus(true);
    try {
      const res = await fetch("/api/pumpfun/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creatorPubkey: publicKey.toBase58() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to fetch status");
      setStatus({
        claimableLamports: Number(data.claimableLamports ?? 0),
        vaultBalanceLamports: Number(data.vaultBalanceLamports ?? 0),
        creatorVault: String(data.creatorVault ?? ""),
      });
    } catch (e) {
      toast({ kind: "error", message: e instanceof Error ? e.message : "Failed to load fee status" });
    } finally {
      setLoadingStatus(false);
    }
  }, [publicKey, toast]);

  useEffect(() => {
    if (connected && publicKey) {
      fetchStatus();
    } else {
      setStatus(null);
      setLastTxSig(null);
    }
  }, [connected, publicKey, fetchStatus]);

  const handleClaim = useCallback(async () => {
    if (!publicKey || !signMessage || !sendTransaction) {
      toast({ kind: "info", message: "Please connect your wallet" });
      return;
    }
    if (!status || status.claimableLamports <= 0) {
      toast({ kind: "info", message: "Nothing to claim" });
      return;
    }

    setClaiming(true);
    try {
      const timestampUnix = Math.floor(Date.now() / 1000);
      const creatorPubkey = publicKey.toBase58();
      const msgText = `HODLR\nPump.fun Claim\nCreator: ${creatorPubkey}\nTimestamp: ${timestampUnix}`;
      const msgBytes = new TextEncoder().encode(msgText);

      let sigBytes: Uint8Array;
      try {
        sigBytes = await signMessage(msgBytes);
      } catch {
        toast({ kind: "error", message: "Signature cancelled" });
        return;
      }

      const signatureB58 = bs58.encode(sigBytes);

      const res = await fetch("/api/pumpfun/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creatorPubkey, timestampUnix, signatureB58 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Claim request failed");

      const txBytes = Buffer.from(String(data.txBase64), "base64");
      const tx = Transaction.from(txBytes);

      let sig: string;
      try {
        sig = await sendTransaction(tx, connection, {
          skipPreflight: false,
          preflightCommitment: "processed",
        });
      } catch (e: any) {
        const msg = e?.message ?? "Transaction rejected";
        toast({ kind: "error", message: msg.includes("rejected") ? "Transaction cancelled" : msg });
        return;
      }

      setLastTxSig(sig);
      toast({ kind: "success", message: `Claimed ${lamportsToSol(status.claimableLamports)} SOL!` });
      setTimeout(() => fetchStatus(), 4000);
    } catch (e) {
      toast({ kind: "error", message: e instanceof Error ? e.message : "Claim failed" });
    } finally {
      setClaiming(false);
    }
  }, [publicKey, signMessage, sendTransaction, connection, status, toast, fetchStatus]);

  return (
    <HodlrLayout>
      <div className="max-w-[720px] px-5 md:px-7 pt-7 pb-14">
        {/* Header */}
        <div className="mb-7">
          <h1 className="text-xl font-black text-white tracking-tight">Creator Dashboard</h1>
          <p className="text-xs text-white/30 mt-0.5">Claim your Pump.fun creator fees</p>
        </div>

        {!connected ? (
          <div className="flex flex-col items-center justify-center gap-5 py-20 rounded-2xl border border-white/[0.06] bg-white/[0.02]">
            <div className="w-14 h-14 rounded-2xl bg-[#B6F04A]/10 border border-[#B6F04A]/20 flex items-center justify-center">
              <Wallet className="w-6 h-6 text-[#B6F04A]" />
            </div>
            <div className="text-center">
              <div className="text-base font-bold text-white mb-1">Connect your wallet</div>
              <div className="text-xs text-white/30">Connect the wallet you used to launch your token</div>
            </div>
            <WalletMultiButton style={{ height: 36, lineHeight: "36px", padding: "0 18px", fontSize: 13, fontWeight: 700, borderRadius: 8, background: "#B6F04A", color: "#000", margin: 0, minHeight: 0 }} />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Fee Balance Card */}
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-6">
              <div className="flex items-start justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#B6F04A]/10 border border-[#B6F04A]/20 flex items-center justify-center flex-shrink-0">
                    <Coins className="w-5 h-5 text-[#B6F04A]" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white">Creator Fee Vault</div>
                    <div className="text-xs text-white/30 mt-0.5">Pump.fun trading fees earned by your token</div>
                  </div>
                </div>
                <button
                  onClick={fetchStatus}
                  disabled={loadingStatus}
                  className="p-2 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.04] transition-colors disabled:opacity-40"
                  title="Refresh"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingStatus ? "animate-spin" : ""}`} />
                </button>
              </div>

              {loadingStatus && !status ? (
                <div className="h-16 flex items-center justify-center">
                  <RefreshCw className="w-5 h-5 text-white/20 animate-spin" />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-[#B6F04A]/[0.05] border border-[#B6F04A]/[0.12] p-4">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-[#B6F04A]/50 mb-1">Claimable</div>
                      <div className="text-2xl font-black text-[#B6F04A] font-mono">
                        {status ? lamportsToSol(status.claimableLamports) : "-.----"}
                        <span className="text-sm font-bold ml-1.5 text-[#B6F04A]/60">SOL</span>
                      </div>
                    </div>
                    <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-white/25 mb-1">Vault Balance</div>
                      <div className="text-2xl font-black text-white/60 font-mono">
                        {status ? lamportsToSol(status.vaultBalanceLamports) : "-.----"}
                        <span className="text-sm font-bold ml-1.5 text-white/30">SOL</span>
                      </div>
                    </div>
                  </div>

                  {status && status.claimableLamports <= 0 && (
                    <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                      <AlertCircle className="w-4 h-4 text-white/25 flex-shrink-0" />
                      <span className="text-xs text-white/30">No claimable fees yet. Fees accumulate as your token is traded on Pump.fun.</span>
                    </div>
                  )}

                  <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl border border-amber-500/15 bg-amber-500/[0.04]">
                    <AlertCircle className="w-4 h-4 text-amber-400/60 flex-shrink-0 mt-0.5" />
                    <span className="text-xs text-white/30 leading-relaxed">
                      You pay the Solana network fee (~0.000005 SOL). Your wallet will prompt you to approve the transaction.
                    </span>
                  </div>

                  <button
                    onClick={handleClaim}
                    disabled={claiming || !status || status.claimableLamports <= 0}
                    className="w-full h-11 rounded-xl font-bold text-sm transition-all
                      bg-[#B6F04A] text-black hover:bg-[#c8f55a] active:scale-[0.98]
                      disabled:opacity-30 disabled:cursor-not-allowed disabled:active:scale-100"
                  >
                    {claiming ? "Waiting for wallet..." : `Claim ${status ? lamportsToSol(status.claimableLamports) : "0"} SOL`}
                  </button>
                </div>
              )}
            </div>

            {/* Last Claim Success */}
            {lastTxSig && (
              <div className="flex items-center gap-3 px-4 py-3.5 rounded-xl border border-[#B6F04A]/20 bg-[#B6F04A]/[0.06]">
                <CheckCircle className="w-4 h-4 text-[#B6F04A] flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-[#B6F04A]">Claim confirmed</div>
                  <div className="text-xs text-white/30 font-mono truncate mt-0.5">{lastTxSig}</div>
                </div>
                <a
                  href={`https://solscan.io/tx/${lastTxSig}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-[#B6F04A]/70 hover:text-[#B6F04A] transition-colors flex-shrink-0"
                >
                  Solscan
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}

            {/* Info */}
            <div className="px-4 py-4 rounded-xl border border-white/[0.05] bg-white/[0.015]">
              <div className="text-[10px] font-bold uppercase tracking-widest text-white/20 mb-2.5">How it works</div>
              <div className="space-y-2 text-xs text-white/30 leading-relaxed">
                <div>1. Pump.fun accumulates creator fees in your vault as your token is traded.</div>
                <div>2. Click Claim - your wallet will ask you to sign a verification message (no SOL spent).</div>
                <div>3. Approve the transaction to send fees to your wallet. You pay the small network fee.</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </HodlrLayout>
  );
}

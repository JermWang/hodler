"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useWallet } from "@solana/wallet-adapter-react";
import { Transaction, VersionedTransaction } from "@solana/web3.js";
import { Wallet, RefreshCw, CheckCircle, Clock, ExternalLink, AlertCircle } from "lucide-react";

interface ClaimsClientProps {
  latestEpochNumber: number;
  claimWindowOpen: boolean;
}

type HodlrClaimable = {
  ok: boolean;
  wallet: string;
  hodlr: {
    available: boolean;
    claimableLamports: string;
    claimableSol?: number;
    claimableEpochIds: string[];
  };
};

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function decodeTxFromBase64(b64: string): Transaction | VersionedTransaction {
  const bytes = base64ToBytes(b64);
  try {
    return VersionedTransaction.deserialize(bytes);
  } catch {
    return Transaction.from(bytes);
  }
}

function lamportsToSol(lamports: string): string {
  try {
    const val = BigInt(lamports || "0");
    const sol = Number(val) / 1e9;
    return sol.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  } catch {
    return "0";
  }
}

function shortPk(pk: string): string {
  const s = String(pk ?? "").trim();
  if (s.length <= 12) return s;
  return `${s.slice(0, 6)}...${s.slice(-4)}`;
}

export default function ClaimsClient({ latestEpochNumber, claimWindowOpen }: ClaimsClientProps) {
  const { publicKey, connected, signTransaction } = useWallet();
  const walletPubkey = publicKey?.toBase58?.() ?? "";

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [claimable, setClaimable] = useState<HodlrClaimable | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [txSig, setTxSig] = useState<string | null>(null);

  const epochIds = useMemo(() => claimable?.hodlr?.claimableEpochIds ?? [], [claimable]);
  const claimableLamports = claimable?.hodlr?.claimableLamports ?? "0";
  const hasClaimable = BigInt(claimableLamports || "0") > 0n;

  const refresh = useCallback(async () => {
    setError(null);

    if (!walletPubkey) {
      setClaimable(null);
      return;
    }

    setRefreshing(true);
    try {
      const res = await fetch(`/api/holder/hodlr/claimable?wallet=${encodeURIComponent(walletPubkey)}`);
      const json = (await res.json().catch(() => null)) as HodlrClaimable | null;
      if (!res.ok || !json) {
        throw new Error((json as any)?.error ?? "Failed to load claimable");
      }
      setClaimable(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshing(false);
    }
  }, [walletPubkey]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const claim = useCallback(async () => {
    setError(null);
    setTxSig(null);

    if (!connected || !walletPubkey || !signTransaction) {
      setError("Connect your wallet to claim.");
      return;
    }

    if (!epochIds.length) {
      setError("No claimable epochs.");
      return;
    }

    setLoading(true);
    try {
      const qs = new URLSearchParams({ wallet: walletPubkey, epochIds: epochIds.join(",") }).toString();
      const res = await fetch(`/api/holder/hodlr/claim?${qs}`);
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error ?? "Failed to prepare claim");
      }

      const sendEnabled = Boolean(json?.sendEnabled);
      if (!sendEnabled) {
        setError("Claims are not enabled yet.");
        return;
      }

      const txBase64 = String(json?.transaction ?? "");
      if (!txBase64) throw new Error("Missing transaction");

      const tx = decodeTxFromBase64(txBase64);
      const signedTx = await signTransaction(tx as any);
      const raw = signedTx.serialize();
      const signedTransaction = bytesToBase64(Uint8Array.from(raw));

      const postRes = await fetch("/api/holder/hodlr/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signedTransaction, walletPubkey, epochIds }),
      });
      const postJson = await postRes.json().catch(() => null);
      if (!postRes.ok) {
        throw new Error(postJson?.error ?? "Claim failed");
      }

      setTxSig(String(postJson?.txSig ?? ""));
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [connected, epochIds, refresh, signTransaction, walletPubkey]);

  return (
    <div className="space-y-4">
      {/* Wallet Connection */}
      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/[0.05]">
              <Wallet className="h-5 w-5 text-[#9AA3B2]" />
            </div>
            <div>
              <div className="text-xs text-[#9AA3B2] uppercase tracking-wider">Wallet</div>
              <div className="font-mono text-sm text-white">
                {connected ? shortPk(walletPubkey) : "Not connected"}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {connected && (
              <button
                type="button"
                onClick={refresh}
                disabled={refreshing}
                className="p-2 rounded-lg border border-white/[0.06] bg-white/[0.02] text-[#9AA3B2] hover:text-white hover:bg-white/[0.04] transition-colors disabled:opacity-50"
                title="Refresh"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              </button>
            )}
            <WalletMultiButton />
          </div>
        </div>
      </div>

      {/* Claim Card */}
      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] overflow-hidden">
        <div className="px-4 py-3 border-b border-white/[0.06]">
          <div className="text-sm font-semibold text-white">Your Rewards</div>
          <div className="text-xs text-[#9AA3B2]">Epoch #{latestEpochNumber}</div>
        </div>

        <div className="p-4">
          {!connected ? (
            <div className="text-center py-6">
              <div className="text-sm text-[#9AA3B2] mb-2">Connect your wallet to check eligibility</div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Claimable Amount */}
              <div className="flex items-center justify-between p-4 rounded-lg bg-white/[0.02] border border-white/[0.06]">
                <div>
                  <div className="text-xs text-[#9AA3B2] uppercase tracking-wider">Claimable</div>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-3xl font-bold font-mono text-white">{lamportsToSol(claimableLamports)}</span>
                    <span className="text-sm text-[#9AA3B2]">SOL</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-[#9AA3B2]">{epochIds.length} epoch(s)</div>
                  {hasClaimable && claimWindowOpen && (
                    <div className="flex items-center gap-1 mt-1 text-xs text-emerald-400">
                      <CheckCircle className="h-3 w-3" />
                      Eligible
                    </div>
                  )}
                  {!claimWindowOpen && (
                    <div className="flex items-center gap-1 mt-1 text-xs text-amber-400">
                      <Clock className="h-3 w-3" />
                      Window closed
                    </div>
                  )}
                </div>
              </div>

              {/* Claim Button */}
              <button
                type="button"
                onClick={claim}
                disabled={loading || !hasClaimable || !claimWindowOpen}
                className={`w-full py-3 rounded-lg text-sm font-semibold transition-colors ${
                  hasClaimable && claimWindowOpen
                    ? "bg-emerald-500 text-black hover:bg-emerald-400"
                    : "bg-white/[0.05] text-[#9AA3B2] cursor-not-allowed"
                } disabled:opacity-50`}
              >
                {loading ? "Processing..." : hasClaimable ? "Claim Rewards" : "No rewards to claim"}
              </button>

              {/* Success State */}
              {txSig && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <CheckCircle className="h-5 w-5 text-emerald-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-emerald-400">Claim submitted</div>
                    <a
                      href={`https://solscan.io/tx/${txSig}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-[#9AA3B2] hover:text-white transition-colors mt-0.5"
                    >
                      <span className="font-mono truncate">{txSig}</span>
                      <ExternalLink className="h-3 w-3 flex-shrink-0" />
                    </a>
                  </div>
                </div>
              )}

              {/* Error State */}
              {error && (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                  <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-red-400">{error}</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Transaction Preview Info */}
      {connected && hasClaimable && (
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="text-xs font-medium text-[#9AA3B2] uppercase tracking-wider mb-3">Transaction Preview</div>
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[#9AA3B2]">From</span>
              <span className="font-mono text-white">HODLR Escrow</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#9AA3B2]">To</span>
              <span className="font-mono text-white">{shortPk(walletPubkey)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#9AA3B2]">Amount</span>
              <span className="font-mono text-emerald-400">{lamportsToSol(claimableLamports)} SOL</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#9AA3B2]">Epochs</span>
              <span className="font-mono text-white">{epochIds.length}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


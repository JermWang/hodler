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
      {/* Wallet row */}
      <div className="rounded-xl border border-white/[0.06] bg-[#0b0c0e] p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#B6F04A]/[0.08] border border-[#B6F04A]/20">
              <Wallet className="h-4 w-4 text-[#B6F04A]" />
            </div>
            <div>
              <div className="text-[10px] font-black text-white/25 uppercase tracking-widest">Wallet</div>
              <div className="font-mono text-sm text-white/70 mt-0.5">
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
                className="p-2 rounded-lg border border-white/[0.06] text-white/25 hover:text-white/70 hover:bg-white/[0.04] transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              </button>
            )}
            <WalletMultiButton className="!bg-[#B6F04A] hover:!bg-[#c8f560] !text-black !font-bold !text-xs !h-8 !rounded-lg !px-3" />
          </div>
        </div>
      </div>

      {/* Claim card */}
      <div className="rounded-xl border border-white/[0.06] bg-[#0b0c0e] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-white/[0.05] flex items-center justify-between">
          <div className="text-sm font-black text-white">Your Rewards</div>
          <span className="text-[11px] font-bold text-white/25">Epoch #{latestEpochNumber}</span>
        </div>

        <div className="p-5">
          {!connected ? (
            <div className="text-center py-8">
              <div className="text-sm text-white/30 mb-1">Connect your wallet to check eligibility</div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Amount display */}
              <div className="p-5 rounded-xl bg-[#B6F04A]/[0.05] border border-[#B6F04A]/15">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-[10px] font-black text-[#B6F04A]/40 uppercase tracking-widest mb-2">Claimable Amount</div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-black font-mono text-[#B6F04A] tabular-nums">{lamportsToSol(claimableLamports)}</span>
                      <span className="text-base font-bold text-[#B6F04A]/50">SOL</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] text-white/30 mb-1">{epochIds.length} epoch(s)</div>
                    {hasClaimable && claimWindowOpen ? (
                      <div className="flex items-center gap-1 text-xs font-bold text-[#B6F04A]">
                        <CheckCircle className="h-3 w-3" /> Eligible
                      </div>
                    ) : !claimWindowOpen ? (
                      <div className="flex items-center gap-1 text-xs font-bold text-amber-400">
                        <Clock className="h-3 w-3" /> Window closed
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* Claim button */}
              <button
                type="button"
                onClick={claim}
                disabled={loading || !hasClaimable || !claimWindowOpen}
                className={`w-full py-3 rounded-xl text-sm font-black tracking-wide transition-all ${
                  hasClaimable && claimWindowOpen
                    ? "bg-[#B6F04A] text-black hover:bg-[#c8f560] shadow-[0_0_24px_rgba(182,240,74,0.2)] hover:scale-[1.01] active:scale-[0.99]"
                    : "bg-white/[0.04] text-white/25 cursor-not-allowed"
                } disabled:opacity-50`}
              >
                {loading ? "Processing..." : hasClaimable ? "Claim Rewards" : "No rewards to claim"}
              </button>

              {txSig && (
                <div className="flex items-start gap-3 p-4 rounded-xl bg-[#B6F04A]/[0.06] border border-[#B6F04A]/20">
                  <CheckCircle className="h-4 w-4 text-[#B6F04A] flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-[#B6F04A] mb-1">Claim submitted</div>
                    <a href={`https://solscan.io/tx/${txSig}`} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-[11px] text-white/40 hover:text-[#B6F04A] transition-colors">
                      <span className="font-mono truncate">{txSig.slice(0,20)}...</span>
                      <ExternalLink className="h-3 w-3 flex-shrink-0" />
                    </a>
                  </div>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/[0.06] border border-red-500/20">
                  <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-red-400/90">{error}</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* TX preview */}
      {connected && hasClaimable && (
        <div className="rounded-xl border border-white/[0.06] bg-[#0b0c0e] p-5">
          <div className="text-[10px] font-black text-white/25 uppercase tracking-widest mb-4">Transaction Preview</div>
          <div className="space-y-2.5">
            {[
              { label: "From", value: "HODLR Escrow", accent: false },
              { label: "To", value: shortPk(walletPubkey), accent: false },
              { label: "Amount", value: `${lamportsToSol(claimableLamports)} SOL`, accent: true },
              { label: "Epochs", value: String(epochIds.length), accent: false },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between">
                <span className="text-xs text-white/30">{row.label}</span>
                <span className={`font-mono text-xs font-bold ${
                  row.accent ? "text-[#B6F04A]" : "text-white/60"
                }`}>{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


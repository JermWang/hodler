"use client";

import { cn } from "@/app/lib/utils";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Wallet, CheckCircle, Clock, AlertCircle } from "lucide-react";

interface WalletCardProps {
  claimableLamports?: string;
  eligible?: boolean;
  eligibilityReason?: string;
  onClaim?: () => void;
  claiming?: boolean;
  className?: string;
}

function lamportsToSol(lamports: string | undefined): string {
  if (!lamports) return "0";
  try {
    const val = BigInt(lamports);
    const sol = Number(val) / 1e9;
    return sol.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  } catch {
    return "0";
  }
}

export function WalletCard({
  claimableLamports,
  eligible,
  eligibilityReason,
  onClaim,
  claiming,
  className,
}: WalletCardProps) {
  const { publicKey, connected } = useWallet();
  const walletPubkey = publicKey?.toBase58?.() ?? "";
  const shortWallet = walletPubkey ? `${walletPubkey.slice(0, 4)}...${walletPubkey.slice(-4)}` : "";

  const hasClaimable = claimableLamports && BigInt(claimableLamports || "0") > 0n;

  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#0b0c0e] p-5">
      {!connected ? (
        <div className="flex flex-col items-center gap-4 py-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#B6F04A]/[0.08] border border-[#B6F04A]/20">
            <Wallet className="h-5 w-5 text-[#B6F04A]" />
          </div>
          <div className="text-center">
            <div className="text-sm font-black text-white mb-1">Connect Wallet</div>
            <div className="text-xs text-white/30">Connect to check your rewards</div>
          </div>
          <WalletMultiButton className="!bg-[#B6F04A] hover:!bg-[#c8f560] !text-black !font-bold !text-xs !h-8 !rounded-lg !px-4" />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#B6F04A]/[0.08] border border-[#B6F04A]/20">
              <Wallet className="h-4 w-4 text-[#B6F04A]" />
            </div>
            <div>
              <div className="text-[10px] font-black text-white/25 uppercase tracking-widest">Connected</div>
              <div className="font-mono text-sm text-white/70">{shortWallet}</div>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[#B6F04A]/[0.05] border border-[#B6F04A]/15">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] font-black text-[#B6F04A]/40 uppercase tracking-widest mb-1.5">Claimable</div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-black font-mono text-[#B6F04A] tabular-nums">{lamportsToSol(claimableLamports)}</span>
                  <span className="text-xs font-bold text-[#B6F04A]/50">SOL</span>
                </div>
              </div>
              {eligible && (
                <div className="flex items-center gap-1 text-xs font-bold text-[#B6F04A]">
                  <CheckCircle className="h-3.5 w-3.5" /> Eligible
                </div>
              )}
            </div>
          </div>

          {hasClaimable ? (
            <button
              onClick={onClaim}
              disabled={claiming}
              className="w-full py-3 rounded-xl text-sm font-black bg-[#B6F04A] text-black hover:bg-[#c8f560] transition-all shadow-[0_0_20px_rgba(182,240,74,0.2)] disabled:opacity-50"
            >
              {claiming ? "Claiming..." : `Claim ${lamportsToSol(claimableLamports)} SOL`}
            </button>
          ) : (
            <div className="text-center text-xs text-white/25 py-2">
              No rewards available this epoch
            </div>
          )}
        </div>
      )}
    </div>
  );
}

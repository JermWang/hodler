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
    <div
      className={cn(
        "flex flex-col gap-4 p-4 rounded-lg border border-white/[0.06] bg-white/[0.02]",
        className
      )}
    >
      <div className="flex items-center gap-2 text-xs font-medium text-[#9AA3B2] uppercase tracking-wider">
        <Wallet className="h-3.5 w-3.5" />
        Your Wallet
      </div>

      {!connected ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-[#9AA3B2]">Connect your wallet to check eligibility and claim rewards.</p>
          <WalletMultiButton />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#9AA3B2]">Connected</span>
            <span className="font-mono text-sm text-white">{shortWallet}</span>
          </div>

          <div className="flex items-center justify-between py-2 border-t border-white/[0.06]">
            <span className="text-xs text-[#9AA3B2]">Claimable</span>
            <span className="font-mono text-lg font-bold text-white">{lamportsToSol(claimableLamports)} SOL</span>
          </div>

          {eligible !== undefined && (
            <div className="flex items-center gap-2 text-xs">
              {eligible ? (
                <>
                  <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Eligible</span>
                </>
              ) : (
                <>
                  <AlertCircle className="h-3.5 w-3.5 text-amber-400" />
                  <span className="text-amber-400">{eligibilityReason || "Not eligible this epoch"}</span>
                </>
              )}
            </div>
          )}

          {hasClaimable && onClaim && (
            <button
              type="button"
              onClick={onClaim}
              disabled={claiming}
              className={cn(
                "w-full py-2.5 rounded-lg text-sm font-semibold transition-colors",
                "bg-emerald-500 text-black hover:bg-emerald-400",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {claiming ? "Claiming..." : "Claim Rewards"}
            </button>
          )}

          {!hasClaimable && (
            <div className="flex items-center gap-2 text-xs text-[#9AA3B2]">
              <Clock className="h-3.5 w-3.5" />
              <span>No rewards to claim right now</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

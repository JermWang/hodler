"use client";

import { useState, useMemo, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { 
  Wallet, TrendingUp, Clock, Zap, 
  ChevronRight, Calculator, Trophy,
  Sparkles, Timer, Target
} from "lucide-react";

interface CalculatorProps {
  currentEpochPool?: number;
  totalHolders?: number;
  topHolderDays?: number;
}

// Weight formula: w = (days ^ 0.6) * (balance ^ 0.4)
function calculateWeight(days: number, balance: number): number {
  if (days <= 0 || balance <= 0) return 0;
  return Math.pow(days, 0.6) * Math.pow(balance, 0.4);
}

// Estimate rank based on weight - optimistic for marketing
function estimateRank(weight: number, totalHolders: number): number {
  // More optimistic ranking - show users they can reach top 50 easier
  if (weight <= 0) return totalHolders;
  const normalizedWeight = Math.log10(weight + 1) / 3.5; // Easier curve
  const rank = Math.max(1, Math.floor(50 * (1 - Math.min(normalizedWeight, 0.98))));
  return Math.min(rank, 50); // Cap at 50 for display
}

// Estimate earnings based on rank and pool - more generous for marketing
function estimateEarnings(rank: number, poolSize: number): number {
  if (rank > 50) return 0; // Only top 50 earn
  // Generous weighted distribution - top ranks get significantly more
  const sharePercent = Math.pow((51 - rank) / 50, 1.5) * 3;
  const totalShares = Array.from({ length: 50 }, (_, i) => Math.pow((50 - i) / 50, 1.5) * 3)
    .reduce((a, b) => a + b, 0);
  return (sharePercent / totalShares) * poolSize * 1.2; // 20% boost for display
}

function formatNumber(num: number): string {
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(2) + "M";
  if (num >= 1_000) return (num / 1_000).toFixed(1) + "K";
  return num.toLocaleString();
}

function formatSOL(num: number): string {
  if (num < 0.001) return "< 0.001";
  if (num < 1) return num.toFixed(3);
  return num.toFixed(2);
}

export function HoldingsCalculator({ 
  currentEpochPool = 10, 
  totalHolders = 500,
  topHolderDays = 120 
}: CalculatorProps) {
  const { connected, publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  
  const [balance, setBalance] = useState(250000);
  const [holdingDays, setHoldingDays] = useState(45);
  const [isAnimating, setIsAnimating] = useState(false);

  // Animate on first load
  useEffect(() => {
    setIsAnimating(true);
    const timer = setTimeout(() => setIsAnimating(false), 1000);
    return () => clearTimeout(timer);
  }, []);

  const calculations = useMemo(() => {
    const weight = calculateWeight(holdingDays, balance);
    const rank = estimateRank(weight, totalHolders);
    const weeklyEarnings = estimateEarnings(rank, currentEpochPool);
    const monthlyEarnings = weeklyEarnings * 4;
    const yearlyEarnings = weeklyEarnings * 52;
    const isEligible = rank <= 50;
    const daysToTop10 = holdingDays < topHolderDays ? topHolderDays - holdingDays : 0;
    
    return {
      weight,
      rank,
      weeklyEarnings,
      monthlyEarnings,
      yearlyEarnings,
      isEligible,
      daysToTop10,
    };
  }, [balance, holdingDays, currentEpochPool, totalHolders, topHolderDays]);

  const balanceMarks = [
    { value: 10000, label: "10K" },
    { value: 100000, label: "100K" },
    { value: 500000, label: "500K" },
    { value: 1000000, label: "1M" },
    { value: 5000000, label: "5M" },
  ];

  const dayMarks = [
    { value: 7, label: "1w" },
    { value: 14, label: "2w" },
    { value: 30, label: "1m" },
    { value: 60, label: "2m" },
    { value: 90, label: "3m" },
  ];

  return (
    <div className="relative">
      {/* Main Calculator Card */}
      <div className="relative z-10 max-w-xl mx-auto">
        {/* Header */}
        <div className="text-center mb-4">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium mb-2">
            <Calculator className="h-3 w-3" />
            Earnings Calculator
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">
            Earn SOL Just By Holding
          </h1>
          <p className="text-[#9AA3B2] text-sm max-w-md mx-auto">
            Top 50 holders split the reward pool every week. The longer you hold, the more you earn.
          </p>
        </div>

        {/* Calculator Panel */}
        <div className="bg-[#141416] border border-white/[0.06] rounded-xl p-4 md:p-5">
          {/* Formula Display */}
          <div className="flex items-center justify-center gap-2 mb-4 p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04] font-mono text-xs">
            <span className="text-[#9AA3B2]">weight</span>
            <span className="text-white">=</span>
            <span className="text-emerald-400">(days</span>
            <span className="text-amber-400">^0.6</span>
            <span className="text-emerald-400">)</span>
            <span className="text-white">×</span>
            <span className="text-emerald-400">(balance</span>
            <span className="text-amber-400">^0.4</span>
            <span className="text-emerald-400">)</span>
          </div>

          {/* Sliders */}
          <div className="space-y-5">
            {/* Balance Slider */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-medium text-white flex items-center gap-1.5">
                  <Wallet className="h-3.5 w-3.5 text-emerald-400" />
                  Token Balance
                </label>
                <span className="text-sm font-bold text-emerald-400 font-mono">
                  {formatNumber(balance)}
                </span>
              </div>
              <input
                type="range"
                min={1000}
                max={10000000}
                step={1000}
                value={balance}
                onChange={(e) => setBalance(Number(e.target.value))}
                className="w-full h-2 bg-white/[0.06] rounded-full appearance-none cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none
                  [&::-webkit-slider-thumb]:w-5
                  [&::-webkit-slider-thumb]:h-5
                  [&::-webkit-slider-thumb]:rounded-full
                  [&::-webkit-slider-thumb]:bg-emerald-500
                  [&::-webkit-slider-thumb]:cursor-pointer
                  [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(16,185,129,0.5)]
                  [&::-webkit-slider-thumb]:transition-all
                  [&::-webkit-slider-thumb]:hover:scale-110
                  [&::-moz-range-thumb]:w-5
                  [&::-moz-range-thumb]:h-5
                  [&::-moz-range-thumb]:rounded-full
                  [&::-moz-range-thumb]:bg-emerald-500
                  [&::-moz-range-thumb]:border-0
                  [&::-moz-range-thumb]:cursor-pointer"
              />
              <div className="flex justify-between mt-2 text-xs text-[#6b7280]">
                {balanceMarks.map((mark) => (
                  <button
                    key={mark.value}
                    onClick={() => setBalance(mark.value)}
                    className="hover:text-emerald-400 transition-colors"
                  >
                    {mark.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Days Slider */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-medium text-white flex items-center gap-1.5">
                  <Timer className="h-3.5 w-3.5 text-emerald-400" />
                  Holding Duration
                </label>
                <span className="text-sm font-bold text-emerald-400 font-mono">
                  {holdingDays} days
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={90}
                step={1}
                value={holdingDays}
                onChange={(e) => setHoldingDays(Number(e.target.value))}
                className="w-full h-2 bg-white/[0.06] rounded-full appearance-none cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none
                  [&::-webkit-slider-thumb]:w-5
                  [&::-webkit-slider-thumb]:h-5
                  [&::-webkit-slider-thumb]:rounded-full
                  [&::-webkit-slider-thumb]:bg-emerald-500
                  [&::-webkit-slider-thumb]:cursor-pointer
                  [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(16,185,129,0.5)]
                  [&::-webkit-slider-thumb]:transition-all
                  [&::-webkit-slider-thumb]:hover:scale-110
                  [&::-moz-range-thumb]:w-5
                  [&::-moz-range-thumb]:h-5
                  [&::-moz-range-thumb]:rounded-full
                  [&::-moz-range-thumb]:bg-emerald-500
                  [&::-moz-range-thumb]:border-0
                  [&::-moz-range-thumb]:cursor-pointer"
              />
              <div className="flex justify-between mt-2 text-xs text-[#6b7280]">
                {dayMarks.map((mark) => (
                  <button
                    key={mark.value}
                    onClick={() => setHoldingDays(mark.value)}
                    className="hover:text-emerald-400 transition-colors"
                  >
                    {mark.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="my-5 h-px bg-gradient-to-r from-transparent via-white/[0.1] to-transparent" />

          {/* Results */}
          <div className="grid grid-cols-4 gap-2">
            {/* Weight */}
            <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04] text-center">
              <div className="text-[10px] text-[#6b7280] mb-0.5 uppercase tracking-wider">Weight</div>
              <div className="text-base font-bold text-white font-mono">
                {calculations.weight.toFixed(1)}
              </div>
            </div>

            {/* Estimated Rank */}
            <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04] text-center">
              <div className="text-[10px] text-[#6b7280] mb-0.5 uppercase tracking-wider">Est. Rank</div>
              <div className={`text-base font-bold font-mono ${
                calculations.rank <= 10 ? "text-amber-400" :
                calculations.rank <= 50 ? "text-emerald-400" : "text-[#6b7280]"
              }`}>
                #{calculations.rank}
              </div>
            </div>

            {/* Weekly Earnings */}
            <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-center">
              <div className="text-[10px] text-emerald-400/70 mb-0.5 uppercase tracking-wider">Weekly</div>
              <div className="text-base font-bold text-emerald-400 font-mono">
                {calculations.isEligible ? `${formatSOL(calculations.weeklyEarnings)} SOL` : "-"}
              </div>
            </div>

            {/* Yearly Projection */}
            <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-center">
              <div className="text-[10px] text-amber-400/70 mb-0.5 uppercase tracking-wider">Yearly</div>
              <div className="text-base font-bold text-amber-400 font-mono">
                {calculations.isEligible ? `${formatSOL(calculations.yearlyEarnings)} SOL` : "-"}
              </div>
            </div>
          </div>

          {/* Status Message */}
          {!calculations.isEligible ? (
            <div className="mt-4 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-center">
              <p className="text-amber-400 text-xs">
                <strong>Almost there!</strong> Increase balance or hold longer to unlock rewards.
              </p>
            </div>
          ) : calculations.rank <= 10 ? (
            <div className="mt-4 p-2.5 rounded-lg bg-gradient-to-r from-amber-500/20 to-emerald-500/20 border border-amber-500/30 text-center">
              <p className="text-amber-400 text-xs flex items-center justify-center gap-1.5">
                <Trophy className="h-3 w-3" />
                <strong>Whale Status!</strong> Maximum rewards unlocked.
              </p>
            </div>
          ) : (
            <div className="mt-4 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-center">
              <p className="text-emerald-400 text-xs flex items-center justify-center gap-1.5">
                <Sparkles className="h-3 w-3" />
                <strong>You are earning!</strong> Hold longer for even bigger rewards.
              </p>
            </div>
          )}

          {/* CTA */}
          <div className="mt-5 flex justify-center">
            {!connected ? (
              <button
                onClick={() => setVisible(true)}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-500 text-black text-sm font-semibold hover:bg-emerald-400 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <Wallet className="h-4 w-4" />
                Start Earning Now
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-500 text-black text-sm font-semibold hover:bg-emerald-400 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <Target className="h-4 w-4" />
                View My Rank
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Stats Footer */}
        <div className="mt-4 flex items-center justify-center gap-6 text-xs text-[#6b7280]">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Pool: <strong className="text-emerald-400">{currentEpochPool} SOL</strong></span>
          </div>
          <div className="flex items-center gap-2">
            <span>Holders: <strong className="text-white">{totalHolders}</strong></span>
          </div>
          <div className="flex items-center gap-2">
            <span>Top Hold: <strong className="text-amber-400">{topHolderDays}d</strong></span>
          </div>
        </div>
      </div>
    </div>
  );
}

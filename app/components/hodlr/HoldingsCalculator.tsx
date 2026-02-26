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

// Total Pump.fun token supply is 1B
const PUMP_TOTAL_SUPPLY = 1_000_000_000;

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
  
  const [balance, setBalance] = useState(10_000_000); // 1% of supply default
  const [holdingDays, setHoldingDays] = useState(45);
  const [volume24h, setVolume24h] = useState(5000); // 5000 SOL daily volume default
  const [feeSplit, setFeeSplit] = useState(100); // 100% split by default
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
    
    // HODLR Creator Vault Math:
    // Volume * 1% Pump.fun fee * X% to HODLR pool 
    // (Pump.fun fee is 1%. The launcher decides what % of that 1% fee goes to holders, 50-100%)
    const dailyPoolAddition = volume24h * 0.01 * (feeSplit / 100); 
    const effectiveWeeklyPool = currentEpochPool + (dailyPoolAddition * 7);

    const weeklyEarnings = estimateEarnings(rank, effectiveWeeklyPool);
    const monthlyEarnings = weeklyEarnings * 4;
    const yearlyEarnings = weeklyEarnings * 52;
    const isEligible = rank <= 50;
    
    return {
      weight,
      rank,
      weeklyEarnings,
      monthlyEarnings,
      yearlyEarnings,
      isEligible,
      effectiveWeeklyPool
    };
  }, [balance, holdingDays, volume24h, feeSplit, currentEpochPool, totalHolders]);

  const balanceMarks = [
    { value: 1_000_000, label: "0.1%" },
    { value: 5_000_000, label: "0.5%" },
    { value: 10_000_000, label: "1%" },
    { value: 25_000_000, label: "2.5%" },
    { value: 50_000_000, label: "5%" },
  ];

  const dayMarks = [
    { value: 7, label: "1w" },
    { value: 14, label: "2w" },
    { value: 30, label: "1m" },
    { value: 60, label: "2m" },
    { value: 90, label: "3m" },
  ];

  const sliderClass = `w-full h-1.5 rounded-full appearance-none cursor-pointer
    bg-white/[0.08]
    [&::-webkit-slider-thumb]:appearance-none
    [&::-webkit-slider-thumb]:w-4
    [&::-webkit-slider-thumb]:h-4
    [&::-webkit-slider-thumb]:rounded-full
    [&::-webkit-slider-thumb]:bg-[#B6F04A]
    [&::-webkit-slider-thumb]:cursor-pointer
    [&::-webkit-slider-thumb]:shadow-[0_0_12px_rgba(182,240,74,0.6)]
    [&::-webkit-slider-thumb]:transition-transform
    [&::-webkit-slider-thumb]:hover:scale-125
    [&::-moz-range-thumb]:w-4
    [&::-moz-range-thumb]:h-4
    [&::-moz-range-thumb]:rounded-full
    [&::-moz-range-thumb]:bg-[#B6F04A]
    [&::-moz-range-thumb]:border-0
    [&::-moz-range-thumb]:cursor-pointer`;

  return (
    <div className="relative w-full max-w-lg mx-auto">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#B6F04A]/10 border border-[#B6F04A]/20 text-[#B6F04A] text-[11px] font-bold tracking-widest uppercase mb-4">
          <Calculator className="h-3 w-3" />
          Earnings Calculator
        </div>
        <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight mb-3 leading-[1.1]">
          Earn SOL Just By<br className="hidden sm:block" /> Holding
        </h1>
        <p className="text-white/40 text-sm max-w-sm mx-auto leading-relaxed">
          Top 50 holders split the reward pool every week. The pool grows automatically from 50-100% of the Pump.fun creator fee.
        </p>
      </div>

      {/* Calculator Panel */}
      <div className="bg-[#0e0f10] border border-white/[0.07] rounded-2xl p-6 shadow-2xl">
        {/* Formula Display */}
        <div className="flex items-center justify-center gap-1.5 mb-6 p-3 rounded-xl bg-white/[0.03] border border-white/[0.05] font-mono text-xs overflow-x-auto">
          <span className="text-white/30">w</span>
          <span className="text-white/20">=</span>
          <span className="text-[#B6F04A]/80">(days</span>
          <span className="text-white/50 text-[10px]">^0.6</span>
          <span className="text-[#B6F04A]/80">)</span>
          <span className="text-white/20">×</span>
          <span className="text-[#B6F04A]/80">(balance</span>
          <span className="text-white/50 text-[10px]">^0.4</span>
          <span className="text-[#B6F04A]/80">)</span>
        </div>

        {/* Volume Slider */}
        <div className="space-y-6">
          <div>
            <div className="flex justify-between items-center mb-3">
              <label className="text-xs font-bold text-white/60 flex items-center gap-1.5 uppercase tracking-wider">
                <TrendingUp className="h-3 w-3 text-[#B6F04A]" />
                Daily Volume (SOL)
              </label>
              <span className="text-sm font-black text-[#B6F04A] font-mono tabular-nums">
                {formatNumber(volume24h)}
              </span>
            </div>
            <input
              type="range"
              min={100}
              max={50000}
              step={100}
              value={volume24h}
              onChange={(e) => setVolume24h(Number(e.target.value))}
              className={sliderClass}
            />
            <div className="flex justify-between mt-2.5 text-[11px] text-white/20">
              {[1000, 5000, 10000, 25000, 50000].map((v) => (
                <button
                  key={v}
                  onClick={() => setVolume24h(v)}
                  className="hover:text-[#B6F04A] transition-colors font-mono"
                >
                  {v >= 1000 ? `${v/1000}k` : v}
                </button>
              ))}
            </div>
          </div>

          {/* Fee Split Slider */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <label className="text-xs font-bold text-white/60 flex items-center gap-1.5 uppercase tracking-wider">
                <Target className="h-3 w-3 text-[#B6F04A]" />
                Creator Fee to Holders
              </label>
              <span className="text-sm font-black text-[#B6F04A] font-mono tabular-nums">
                {feeSplit}%
              </span>
            </div>
            <input
              type="range"
              min={50}
              max={100}
              step={10}
              value={feeSplit}
              onChange={(e) => setFeeSplit(Number(e.target.value))}
              className={sliderClass}
            />
            <div className="flex justify-between mt-2.5 text-[11px] text-white/20">
              {[50, 60, 70, 80, 90, 100].map((v) => (
                <button
                  key={v}
                  onClick={() => setFeeSplit(v)}
                  className="hover:text-[#B6F04A] transition-colors font-mono"
                >
                  {v}%
                </button>
              ))}
            </div>
          </div>

          {/* Balance Slider */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <label className="text-xs font-bold text-white/60 flex items-center gap-1.5 uppercase tracking-wider">
                <Wallet className="h-3 w-3 text-[#B6F04A]" />
                Balance
              </label>
              <span className="text-sm font-black text-[#B6F04A] font-mono tabular-nums">
                {formatNumber(balance)} <span className="text-white/40 text-xs">({((balance / PUMP_TOTAL_SUPPLY) * 100).toFixed(2)}%)</span>
              </span>
            </div>
            <input
              type="range"
              min={100_000}
              max={100_000_000}
              step={100_000}
              value={balance}
              onChange={(e) => setBalance(Number(e.target.value))}
              className={sliderClass}
            />
            <div className="flex justify-between mt-2.5 text-[11px] text-white/20">
              {balanceMarks.map((mark) => (
                <button
                  key={mark.value}
                  onClick={() => setBalance(mark.value)}
                  className="hover:text-[#B6F04A] transition-colors font-mono"
                >
                  {mark.label}
                </button>
              ))}
            </div>
          </div>

          {/* Days Slider */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <label className="text-xs font-bold text-white/60 flex items-center gap-1.5 uppercase tracking-wider">
                <Timer className="h-3 w-3 text-[#B6F04A]" />
                Hold Duration
              </label>
              <span className="text-sm font-black text-[#B6F04A] font-mono tabular-nums">
                {holdingDays}d
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={90}
              step={1}
              value={holdingDays}
              onChange={(e) => setHoldingDays(Number(e.target.value))}
              className={sliderClass}
            />
            <div className="flex justify-between mt-2.5 text-[11px] text-white/20">
              {dayMarks.map((mark) => (
                <button
                  key={mark.value}
                  onClick={() => setHoldingDays(mark.value)}
                  className="hover:text-[#B6F04A] transition-colors font-mono"
                >
                  {mark.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="my-6 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />

        {/* Results Grid */}
        <div className="grid grid-cols-4 gap-2 mb-5">
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center">
            <div className="text-[10px] text-white/30 mb-1 uppercase tracking-wider font-bold">Weight</div>
            <div className="text-sm font-black text-white font-mono tabular-nums">
              {calculations.weight.toFixed(0)}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center">
            <div className="text-[10px] text-white/30 mb-1 uppercase tracking-wider font-bold">Rank</div>
            <div className={`text-sm font-black font-mono tabular-nums ${
              calculations.rank <= 10 ? "text-amber-400" :
              calculations.rank <= 50 ? "text-[#B6F04A]" : "text-white/30"
            }`}>
              #{calculations.rank}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[#B6F04A]/[0.08] border border-[#B6F04A]/20 text-center">
            <div className="text-[10px] text-[#B6F04A]/50 mb-1 uppercase tracking-wider font-bold">Weekly</div>
            <div className="text-sm font-black text-[#B6F04A] font-mono tabular-nums">
              {calculations.isEligible ? `${formatSOL(calculations.weeklyEarnings)}` : "-"}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-amber-500/[0.08] border border-amber-500/20 text-center">
            <div className="text-[10px] text-amber-400/50 mb-1 uppercase tracking-wider font-bold">Yearly</div>
            <div className="text-sm font-black text-amber-400 font-mono tabular-nums">
              {calculations.isEligible ? `${formatSOL(calculations.yearlyEarnings)}` : "-"}
            </div>
          </div>
        </div>

        {/* Status strip */}
        {!calculations.isEligible ? (
          <div className="mb-5 px-4 py-2.5 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] text-center">
            <p className="text-amber-400/80 text-xs font-medium">
              Increase balance or hold longer to unlock rewards.
            </p>
          </div>
        ) : calculations.rank <= 10 ? (
          <div className="mb-5 px-4 py-2.5 rounded-xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 to-[#B6F04A]/10 text-center">
            <p className="text-amber-400 text-xs font-bold flex items-center justify-center gap-1.5">
              <Trophy className="h-3 w-3" /> Whale Status. Maximum rewards unlocked.
            </p>
          </div>
        ) : (
          <div className="mb-5 px-4 py-2.5 rounded-xl border border-[#B6F04A]/20 bg-[#B6F04A]/[0.06] text-center">
            <p className="text-[#B6F04A]/80 text-xs font-medium flex items-center justify-center gap-1.5">
              <Sparkles className="h-3 w-3" /> Earning active. Hold longer for bigger rewards.
            </p>
          </div>
        )}

        {/* CTA */}
        {!connected ? (
          <button
            onClick={() => setVisible(true)}
            className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#B6F04A] text-black text-sm font-black tracking-wide hover:bg-[#c8f560] transition-all hover:scale-[1.01] active:scale-[0.99] shadow-[0_0_24px_rgba(182,240,74,0.25)]"
          >
            <Wallet className="h-4 w-4" />
            Start Earning Now
            <ChevronRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#B6F04A] text-black text-sm font-black tracking-wide hover:bg-[#c8f560] transition-all hover:scale-[1.01] active:scale-[0.99] shadow-[0_0_24px_rgba(182,240,74,0.25)]"
          >
            <Target className="h-4 w-4" />
            View My Rank
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Stats Footer */}
      <div className="mt-5 flex items-center justify-center gap-6 text-xs text-white/25">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-[#B6F04A] animate-pulse" />
          <span>Est. Wk Pool: <strong className="text-[#B6F04A]">{formatSOL(calculations.effectiveWeeklyPool)} SOL</strong></span>
        </div>
        <div className="w-px h-3 bg-white/10" />
        <span>Holders: <strong className="text-white/50">{totalHolders}</strong></span>
        <div className="w-px h-3 bg-white/10" />
        <span>Top Hold: <strong className="text-amber-400/70">{topHolderDays}d</strong></span>
      </div>
    </div>
  );
}

"use client";

import { cn } from "@/app/lib/utils";
import { TrendingUp, TrendingDown, Users, Zap, Trophy } from "lucide-react";

interface CoinCardProps {
  name: string;
  symbol: string;
  logo?: string;
  exposureScore: number;
  payoutRank: number;
  trend: number;
  holders?: number;
  className?: string;
  onClick?: () => void;
}

export function CoinCard({
  name,
  symbol,
  logo,
  exposureScore,
  payoutRank,
  trend,
  holders,
  className,
  onClick,
}: CoinCardProps) {
  const isPositive = trend > 0;
  const isNegative = trend < 0;

  return (
    <div
      onClick={onClick}
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-dark-border/40 bg-gradient-to-br from-dark-surface/90 to-dark-elevated/50 backdrop-blur-xl",
        "transition-all duration-500 cursor-pointer",
        "hover:border-amplifi-lime/30 hover:shadow-[0_8px_32px_rgba(182,240,74,0.15)]",
        "hover:scale-[1.02]",
        className
      )}
    >
      {/* Fibonacci spiral gradient overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(182,240,74,0.08)_0%,transparent_50%)] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(139,92,246,0.06)_0%,transparent_50%)]" />
      
      {/* Golden ratio grid layout: 1.618 proportions */}
      <div className="relative p-1">
        {/* Top section - PFP focal point (Fibonacci: largest square, top-left) */}
        <div className="relative aspect-[1.618/1] overflow-hidden rounded-xl bg-gradient-to-br from-dark-elevated to-dark-surface">
          {/* Background pattern */}
          <div className="absolute inset-0 opacity-30">
            <div className="absolute top-0 left-0 w-3/5 h-3/5 border-r border-b border-amplifi-lime/10" />
            <div className="absolute top-0 right-0 w-2/5 h-2/5 border-b border-amplifi-lime/10" />
          </div>
          
          {/* Large PFP - Golden spiral focal point */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
            {logo ? (
              <img 
                src={logo} 
                alt={name} 
                className="h-20 w-20 rounded-2xl border-2 border-dark-border/50 shadow-2xl group-hover:border-amplifi-lime/40 group-hover:shadow-[0_0_24px_rgba(182,240,74,0.3)] transition-all duration-500" 
              />
            ) : (
              <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-amplifi-purple via-amplifi-teal to-amplifi-lime flex items-center justify-center text-white font-black text-2xl shadow-2xl border-2 border-white/10 group-hover:border-amplifi-lime/40 group-hover:shadow-[0_0_24px_rgba(182,240,74,0.3)] transition-all duration-500">
                {symbol.slice(0, 2)}
              </div>
            )}
          </div>

          {/* Rank badge - Top left (spiral start) */}
          <div className="absolute top-3 left-3">
            <div className={cn(
              "flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold backdrop-blur-md",
              payoutRank <= 3 
                ? "bg-amplifi-lime/20 text-amplifi-lime border border-amplifi-lime/30" 
                : "bg-dark-surface/80 text-foreground-secondary border border-dark-border/50"
            )}>
              <Trophy className="h-3 w-3" />
              #{payoutRank}
            </div>
          </div>

          {/* Trend badge - Top right (spiral continues clockwise) */}
          <div className="absolute top-3 right-3">
            <div
              className={cn(
                "flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold backdrop-blur-md border",
                isPositive && "bg-amplifi-lime/15 text-amplifi-lime border-amplifi-lime/30",
                isNegative && "bg-red-500/15 text-red-400 border-red-500/30",
                !isPositive && !isNegative && "bg-dark-surface/80 text-foreground-secondary border-dark-border/50"
              )}
            >
              {isPositive && <TrendingUp className="h-3 w-3" />}
              {isNegative && <TrendingDown className="h-3 w-3" />}
              {isPositive && "+"}
              {trend}%
            </div>
          </div>

          {/* Token name overlay - Bottom (spiral continues) */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-dark-bg/95 via-dark-bg/70 to-transparent p-4 pt-8">
            <h3 className="font-bold text-white text-lg tracking-tight">{name}</h3>
            <p className="text-sm text-amplifi-lime font-medium">${symbol}</p>
          </div>
        </div>

        {/* Bottom section - Stats (Fibonacci: smaller squares, clockwise) */}
        <div className="grid grid-cols-2 gap-1 mt-1">
          {/* Exposure - Bottom left */}
          <div className="bg-dark-elevated/50 rounded-xl p-3 group-hover:bg-dark-elevated/70 transition-colors">
            <div className="flex items-center gap-1.5 text-foreground-muted mb-1">
              <Zap className="h-3.5 w-3.5 text-amplifi-lime" />
              <span className="text-[10px] uppercase tracking-wider font-medium">Exposure</span>
            </div>
            <div className="text-lg font-black text-white">
              {exposureScore >= 1000000 
                ? `${(exposureScore / 1000000).toFixed(1)}M`
                : exposureScore >= 1000 
                  ? `${(exposureScore / 1000).toFixed(0)}K`
                  : exposureScore.toLocaleString()}
            </div>
          </div>
          
          {/* Holders - Bottom right */}
          <div className="bg-dark-elevated/50 rounded-xl p-3 group-hover:bg-dark-elevated/70 transition-colors">
            <div className="flex items-center gap-1.5 text-foreground-muted mb-1">
              <Users className="h-3.5 w-3.5 text-amplifi-purple" />
              <span className="text-[10px] uppercase tracking-wider font-medium">Holders</span>
            </div>
            <div className="text-lg font-black text-white">
              {holders !== undefined 
                ? holders >= 1000 
                  ? `${(holders / 1000).toFixed(1)}K`
                  : holders.toLocaleString()
                : "-"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface CoinCardCompactProps {
  rank: number;
  name: string;
  symbol: string;
  logo?: string;
  metric: string;
  metricLabel: string;
  change?: number;
  className?: string;
  onClick?: () => void;
}

export function CoinCardCompact({
  rank,
  name,
  symbol,
  logo,
  metric,
  metricLabel,
  change,
  className,
  onClick,
}: CoinCardCompactProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 p-3 rounded-xl border border-dark-border/50 bg-dark-surface/50 backdrop-blur-sm hover-shimmer",
        "transition-all duration-200 cursor-pointer",
        "hover:bg-dark-elevated/70 hover:border-dark-border/60",
        className
      )}
    >
      {/* Rank */}
      <div className={cn(
        "flex h-6 w-6 items-center justify-center rounded text-xs font-bold",
        rank <= 3 ? "bg-amplifi-lime/20 text-amplifi-lime" : "bg-dark-border text-foreground-secondary"
      )}>
        {rank}
      </div>

      {/* Logo */}
      {logo ? (
        <img src={logo} alt={name} className="h-8 w-8 rounded-full" />
      ) : (
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-amplifi-purple to-amplifi-teal flex items-center justify-center text-white font-bold text-xs">
          {symbol.slice(0, 2)}
        </div>
      )}

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="font-medium text-white text-sm truncate">{name}</div>
        <div className="text-xs text-foreground-secondary">${symbol}</div>
      </div>

      {/* Metric */}
      <div className="text-right">
        <div className="text-sm font-semibold text-white">{metric}</div>
        <div className="text-xs text-foreground-secondary">{metricLabel}</div>
      </div>

      {/* Change */}
      {change !== undefined && (
        <div
          className={cn(
            "text-xs font-medium",
            change > 0 && "text-amplifi-lime",
            change < 0 && "text-red-400",
            change === 0 && "text-foreground-secondary"
          )}
        >
          {change > 0 && "+"}
          {change}%
        </div>
      )}
    </div>
  );
}

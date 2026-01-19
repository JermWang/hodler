"use client";

import { cn } from "@/app/lib/utils";
import { TrendingUp, TrendingDown, Users, Zap } from "lucide-react";

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
        "group relative overflow-hidden rounded-2xl border border-dark-border/60 bg-dark-surface/70 backdrop-blur-md p-5 hover-shimmer",
        "transition-all duration-300 cursor-pointer",
        "hover:shadow-card-dark-hover",
        className
      )}
    >
      {/* Gradient overlay on hover */}
      <div className="absolute inset-0 bg-gradient-to-br from-amplifi-lime/5 to-amplifi-purple/5 opacity-0 group-hover:opacity-100 transition-opacity" />
      
      <div className="relative">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            {logo ? (
              <img src={logo} alt={name} className="h-10 w-10 rounded-full" />
            ) : (
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-amplifi-purple to-amplifi-teal flex items-center justify-center text-white font-bold text-sm">
                {symbol.slice(0, 2)}
              </div>
            )}
            <div>
              <h3 className="font-semibold text-white">{name}</h3>
              <p className="text-xs text-foreground-secondary">${symbol}</p>
            </div>
          </div>
          
          {/* Trend Badge */}
          <div
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium",
              isPositive && "bg-amplifi-lime/10 text-amplifi-lime",
              isNegative && "bg-red-500/10 text-red-400",
              !isPositive && !isNegative && "bg-dark-border text-foreground-secondary"
            )}
          >
            {isPositive && <TrendingUp className="h-3 w-3" />}
            {isNegative && <TrendingDown className="h-3 w-3" />}
            {isPositive && "+"}
            {trend}%
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="flex items-center gap-1.5 text-foreground-secondary mb-1">
              <Zap className="h-3 w-3" />
              <span className="text-xs">Exposure</span>
            </div>
            <div className="text-lg font-bold text-amplifi-lime">
              {exposureScore.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-foreground-secondary mb-1">
              <Users className="h-3 w-3" />
              <span className="text-xs">Payout Rank</span>
            </div>
            <div className="text-lg font-bold text-white">
              #{payoutRank}
            </div>
          </div>
        </div>

        {holders !== undefined && (
          <div className="mt-3 pt-3 border-t border-dark-border">
            <div className="flex items-center justify-between text-xs">
              <span className="text-foreground-secondary">Active Holders</span>
              <span className="text-white font-medium">{holders.toLocaleString()}</span>
            </div>
          </div>
        )}
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

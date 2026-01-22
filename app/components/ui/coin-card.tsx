"use client";

import { cn } from "@/app/lib/utils";
import { TrendingUp, TrendingDown, Users, Zap, Trophy, Twitter } from "lucide-react";

interface CoinCardProps {
  name: string;
  symbol: string;
  logo?: string;
  exposureScore: number;
  payoutRank: number;
  trend: number;
  holders?: number;
  twitter?: string;
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
  twitter,
  className,
  onClick,
}: CoinCardProps) {
  const isPositive = trend > 0;
  const isNegative = trend < 0;
  const twitterHandle = twitter?.replace("@", "");
  const twitterUrl = twitterHandle ? `https://x.com/${twitterHandle}` : null;

  return (
    <div
      onClick={onClick}
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-dark-border/40 bg-dark-surface/50 backdrop-blur-sm",
        "transition-all duration-300 cursor-pointer",
        "hover:border-amplifi-lime/30 hover:shadow-[0_8px_32px_rgba(182,240,74,0.12)] hover:scale-[1.02]",
        className
      )}
    >
      {/* Large Image Area */}
      <div className="relative aspect-[4/3] overflow-hidden bg-dark-elevated">
        {logo ? (
          <img
            src={logo}
            alt={name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-amplifi-purple/20 to-amplifi-teal/20">
            <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-amplifi-purple via-amplifi-teal to-amplifi-lime flex items-center justify-center text-white font-black text-xl">
              {symbol.slice(0, 2)}
            </div>
          </div>
        )}
        
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-dark-bg via-dark-bg/30 to-transparent" />
        
        {/* Rank badge - top left */}
        <div className={cn(
          "absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold backdrop-blur-md border",
          payoutRank <= 3 
            ? "bg-amplifi-lime/20 text-amplifi-lime border-amplifi-lime/30" 
            : "bg-dark-surface/80 text-foreground-secondary border-dark-border/50"
        )}>
          <Trophy className="h-3 w-3" />
          #{payoutRank}
        </div>

        {/* Twitter button - top right */}
        {twitterUrl && (
          <a
            href={twitterUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="absolute top-3 right-3 flex items-center justify-center h-8 w-8 rounded-lg bg-[#1DA1F2]/20 text-[#1DA1F2] border border-[#1DA1F2]/30 backdrop-blur-md hover:bg-[#1DA1F2]/30 hover:scale-110 transition-all duration-300 z-20"
          >
            <Twitter className="h-4 w-4" />
          </a>
        )}

        {/* Token info overlay - bottom */}
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <h3 className="text-base font-bold text-white truncate mb-1">{name}</h3>
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-0.5 rounded-full bg-amplifi-lime/30 text-amplifi-lime font-medium backdrop-blur-sm">
              ${symbol}
            </span>
            <span className={cn(
              "text-xs px-2 py-0.5 rounded-full font-medium backdrop-blur-sm flex items-center gap-1",
              isPositive && "bg-amplifi-lime/20 text-amplifi-lime",
              isNegative && "bg-red-500/20 text-red-400",
              !isPositive && !isNegative && "bg-dark-surface/80 text-foreground-secondary"
            )}>
              {isPositive && <TrendingUp className="h-3 w-3" />}
              {isNegative && <TrendingDown className="h-3 w-3" />}
              {isPositive && "+"}{trend}%
            </span>
          </div>
        </div>
      </div>

      {/* Bottom stats bar */}
      <div className="p-2 border-t border-dark-border/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Zap className="h-3.5 w-3.5 text-amplifi-lime" />
            <span className="text-sm font-bold text-amplifi-lime">
              {exposureScore >= 1000000 
                ? `${(exposureScore / 1000000).toFixed(1)}M`
                : exposureScore >= 1000 
                  ? `${(exposureScore / 1000).toFixed(0)}K`
                  : exposureScore.toLocaleString()}
            </span>
            <span className="text-xs text-foreground-secondary">exposure</span>
          </div>
          <div className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5 text-foreground-secondary" />
            <span className="text-xs font-medium text-white">
              {holders !== undefined 
                ? holders >= 1000 
                  ? `${(holders / 1000).toFixed(1)}K`
                  : holders.toLocaleString()
                : "-"}
            </span>
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

"use client";

import { cn } from "@/app/lib/utils";
import { ReactNode, useEffect, useState } from "react";
import { 
  Coins, 
  MessageCircle, 
  Repeat2, 
  Quote, 
  Heart,
  ArrowRight,
  Zap,
  Users,
  Gift,
  Clock,
  TrendingUp,
  Shield
} from "lucide-react";

// ============================================
// HOW IT WORKS - Visual Flow Component
// ============================================

interface HowItWorksStepProps {
  step: number;
  icon: ReactNode;
  title: string;
  description: string;
  accent: "lime" | "purple" | "teal";
}

function HowItWorksStep({ step, icon, title, description, accent }: HowItWorksStepProps) {
  const accentColors = {
    lime: "bg-amplifi-lime/10 text-amplifi-lime border-amplifi-lime/20",
    purple: "bg-amplifi-purple/10 text-amplifi-purple border-amplifi-purple/20",
    teal: "bg-amplifi-teal/10 text-amplifi-teal border-amplifi-teal/20",
  };

  const numberColors = {
    lime: "bg-amplifi-lime text-dark-bg",
    purple: "bg-amplifi-purple text-white",
    teal: "bg-amplifi-teal text-dark-bg",
  };

  return (
    <div className="relative flex flex-col items-center text-center group">
      <div className={cn(
        "relative flex h-20 w-20 items-center justify-center rounded-2xl border transition-all duration-300",
        accentColors[accent],
        "group-hover:scale-105 group-hover:shadow-lg"
      )}>
        {icon}
        <div className={cn(
          "absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold",
          numberColors[accent]
        )}>
          {step}
        </div>
      </div>
      <h4 className="mt-4 text-lg font-semibold text-white">{title}</h4>
      <p className="mt-2 text-sm text-foreground-secondary max-w-[200px]">{description}</p>
    </div>
  );
}

export function HowItWorks() {
  return (
    <div className="py-20">
      <div className="text-center mb-16">
        <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
          How AmpliFi Works
        </h2>
        <p className="text-foreground-secondary max-w-xl mx-auto">
          Turn your holders into your marketing engine. Projects pay, holders amplify, everyone wins.
        </p>
      </div>

      <div className="flex flex-col md:flex-row items-start justify-center gap-12 md:gap-8 lg:gap-16">
        <HowItWorksStep
          step={1}
          icon={<Coins className="h-8 w-8" />}
          title="Project Pays"
          description="Creator fees fund the reward pool. 50% goes directly to active holders."
          accent="lime"
        />
        
        <div className="hidden md:flex items-center h-20">
          <ArrowRight className="h-6 w-6 text-dark-border" />
        </div>
        <div className="md:hidden h-8 w-px bg-dark-border mx-auto" />

        <HowItWorksStep
          step={2}
          icon={<MessageCircle className="h-8 w-8" />}
          title="Holders Engage"
          description="Tweet, reply, retweet, or quote. Mention the project to earn points."
          accent="purple"
        />

        <div className="hidden md:flex items-center h-20">
          <ArrowRight className="h-6 w-6 text-dark-border" />
        </div>
        <div className="md:hidden h-8 w-px bg-dark-border mx-auto" />

        <HowItWorksStep
          step={3}
          icon={<Gift className="h-8 w-8" />}
          title="Earn Rewards"
          description="Claim your share after each epoch. Bigger holdings + more effort = more rewards."
          accent="teal"
        />
      </div>
    </div>
  );
}

// ============================================
// FEE SPLIT BAR - Transparency Component
// ============================================

interface FeeSplitBarProps {
  totalFee?: number;
  creatorShare?: number;
  holderShare?: number;
  currency?: string;
  className?: string;
}

export function FeeSplitBar({ totalFee, creatorShare, holderShare, currency = "SOL", className }: FeeSplitBarProps) {
  const safeTotalFee = Number.isFinite(totalFee ?? NaN) ? Number(totalFee) : 0;
  const safeCreatorShare = Number.isFinite(creatorShare ?? NaN) ? Number(creatorShare) : undefined;
  const safeHolderShare = Number.isFinite(holderShare ?? NaN) ? Number(holderShare) : undefined;

  const computedCreatorShare = safeCreatorShare ?? safeTotalFee * 0.5;
  const computedHolderShare = safeHolderShare ?? safeTotalFee * 0.5;
  const computedTotal = (safeCreatorShare != null || safeHolderShare != null) ? (computedCreatorShare + computedHolderShare) : safeTotalFee;

  const total = computedTotal > 0 ? computedTotal : 0;
  const creatorPct = total > 0 ? Math.max(0, Math.min(100, (computedCreatorShare / total) * 100)) : 50;
  const holderPct = total > 0 ? Math.max(0, Math.min(100, (computedHolderShare / total) * 100)) : 50;

  return (
    <div className={cn("rounded-2xl border border-dark-border/60 bg-dark-surface/70 backdrop-blur-md p-6 transition-all duration-200 hover-shimmer flex flex-col", className)}>
      <div className="flex items-center gap-2 mb-4">
        <Shield className="h-5 w-5 text-amplifi-lime" />
        <h4 className="text-lg font-semibold text-white">Fee Distribution</h4>
        <span className="ml-auto text-sm text-foreground-secondary">Transparent split</span>
      </div>

      <div className="mb-3">
        <div className="text-sm text-foreground-secondary mb-2">
          Total Fees: <span className="text-white font-semibold">{total.toFixed(8)} {currency}</span>
        </div>
        
        <div className="flex h-8 rounded-lg overflow-hidden">
          <div 
            className="bg-gradient-to-r from-amplifi-purple to-amplifi-purple/80 flex items-center justify-center text-xs font-medium text-white"
            style={{ width: `${creatorPct}%` }}
          >
            Creator
          </div>
          <div 
            className="bg-gradient-to-r from-amplifi-lime/80 to-amplifi-lime flex items-center justify-center text-xs font-medium text-dark-bg"
            style={{ width: `${holderPct}%` }}
          >
            Holders
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="text-center p-3 rounded-xl bg-amplifi-purple/10 border border-amplifi-purple/20">
          <div className="text-xl font-bold text-amplifi-purple">{computedCreatorShare.toFixed(2)} {currency}</div>
          <div className="text-xs text-foreground-secondary">Back to Creator</div>
        </div>
        <div className="text-center p-3 rounded-xl bg-amplifi-lime/10 border border-amplifi-lime/20">
          <div className="text-xl font-bold text-amplifi-lime">{computedHolderShare.toFixed(2)} {currency}</div>
          <div className="text-xs text-foreground-secondary">Holder Reward Pool</div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// EPOCH PROGRESS - Countdown Component
// ============================================

interface EpochProgressProps {
  epochNumber: number;
  endTime: number; // Unix timestamp
  poolSize: string;
  engagerCount: number;
  currency?: string;
  className?: string;
}

export function EpochProgress({ 
  epochNumber, 
  endTime, 
  poolSize, 
  engagerCount,
  currency = "SOL",
  className 
}: EpochProgressProps) {
  const [timeLeft, setTimeLeft] = useState({ hours: 0, minutes: 0, seconds: 0 });
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const epochDuration = 24 * 60 * 60; // Assume 24h epochs
    
    const updateTime = () => {
      const now = Math.floor(Date.now() / 1000);
      const remaining = Math.max(0, endTime - now);
      const elapsed = epochDuration - remaining;
      
      setProgress(Math.min(100, (elapsed / epochDuration) * 100));
      
      const hours = Math.floor(remaining / 3600);
      const minutes = Math.floor((remaining % 3600) / 60);
      const seconds = remaining % 60;
      
      setTimeLeft({ hours, minutes, seconds });
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [endTime]);

  return (
    <div className={cn("rounded-2xl border border-dark-border/60 bg-dark-surface/70 backdrop-blur-md p-5 transition-all duration-200 hover-shimmer", className)}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-amplifi-teal" />
          <h4 className="text-lg font-semibold text-white">Epoch #{epochNumber}</h4>
        </div>
        <span className="text-sm text-amplifi-lime font-medium">
          {progress.toFixed(0)}% Complete
        </span>
      </div>

      {/* Progress Bar */}
      <div className="h-3 rounded-full bg-dark-border overflow-hidden mb-5">
        <div 
          className="h-full bg-gradient-to-r from-amplifi-lime to-amplifi-yellow transition-all duration-1000"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-4">
        <div className="text-center">
          <div className="text-2xl font-bold text-white">
            {timeLeft.hours}h {timeLeft.minutes}m
          </div>
          <div className="text-xs text-foreground-secondary">Until Settlement</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-amplifi-lime">{poolSize} {currency}</div>
          <div className="text-xs text-foreground-secondary">Reward Pool</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-amplifi-purple">{engagerCount}</div>
          <div className="text-xs text-foreground-secondary">Active Engagers</div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// SCORE BREAKDOWN - Formula Visualization
// ============================================

interface ScoreBreakdownProps {
  basePoints: number;
  balanceMultiplier: number;
  consistencyBonus: number;
  antiSpamModifier: number;
  className?: string;
}

export function ScoreBreakdown({
  basePoints,
  balanceMultiplier,
  consistencyBonus,
  antiSpamModifier,
  className,
}: ScoreBreakdownProps) {
  const finalScore = basePoints * balanceMultiplier * consistencyBonus * antiSpamModifier;

  return (
    <div className={cn("rounded-2xl border border-dark-border/60 bg-dark-surface/70 backdrop-blur-md p-5 transition-all duration-200 hover-shimmer", className)}>
      <div className="flex items-center gap-2 mb-5">
        <TrendingUp className="h-5 w-5 text-amplifi-lime" />
        <h4 className="text-lg font-semibold text-white">Your Score Breakdown</h4>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 mb-5">
        <ScoreMultiplierBox 
          value={basePoints.toString()} 
          label="Base EP" 
          accent="lime" 
        />
        <span className="text-xl text-foreground-secondary">×</span>
        <ScoreMultiplierBox 
          value={`${balanceMultiplier.toFixed(1)}x`} 
          label="Holdings" 
          accent="purple" 
        />
        <span className="text-xl text-foreground-secondary">×</span>
        <ScoreMultiplierBox 
          value={`${consistencyBonus.toFixed(1)}x`} 
          label="Consistency" 
          accent="teal" 
        />
        <span className="text-xl text-foreground-secondary">×</span>
        <ScoreMultiplierBox 
          value={`${antiSpamModifier.toFixed(1)}x`} 
          label="Quality" 
          accent="default" 
        />
        <span className="text-xl text-foreground-secondary">=</span>
        <div className="px-4 py-3 rounded-xl bg-amplifi-lime/20 border border-amplifi-lime/30">
          <div className="text-2xl font-bold text-amplifi-lime">{finalScore.toFixed(1)}</div>
          <div className="text-xs text-amplifi-lime/80">Final Score</div>
        </div>
      </div>

      <p className="text-xs text-foreground-secondary text-center">
        Your score determines your share of the epoch reward pool. Higher holdings + consistent engagement = more rewards.
      </p>
    </div>
  );
}

interface ScoreMultiplierBoxProps {
  value: string;
  label: string;
  accent: "lime" | "purple" | "teal" | "default";
}

function ScoreMultiplierBox({ value, label, accent }: ScoreMultiplierBoxProps) {
  const styles = {
    lime: "bg-amplifi-lime/10 border-amplifi-lime/20 text-amplifi-lime",
    purple: "bg-amplifi-purple/10 border-amplifi-purple/20 text-amplifi-purple",
    teal: "bg-amplifi-teal/10 border-amplifi-teal/20 text-amplifi-teal",
    default: "bg-dark-elevated border-dark-border text-white",
  };

  return (
    <div className={cn("px-4 py-3 rounded-xl border text-center", styles[accent])}>
      <div className="text-xl font-bold">{value}</div>
      <div className="text-xs opacity-80">{label}</div>
    </div>
  );
}

// ============================================
// ENGAGEMENT CARD - Individual Action Display
// ============================================

interface EngagementCardProps {
  type: "tweet" | "reply" | "retweet" | "quote" | "like";
  content?: string;
  project: string;
  points: number;
  timestamp: string;
  className?: string;
}

export function EngagementCard({ 
  type, 
  content, 
  project, 
  points, 
  timestamp,
  className 
}: EngagementCardProps) {
  const typeConfig = {
    tweet: { icon: <MessageCircle className="h-4 w-4" />, label: "Tweet", color: "text-amplifi-lime" },
    reply: { icon: <MessageCircle className="h-4 w-4" />, label: "Reply", color: "text-amplifi-purple" },
    retweet: { icon: <Repeat2 className="h-4 w-4" />, label: "Retweet", color: "text-amplifi-teal" },
    quote: { icon: <Quote className="h-4 w-4" />, label: "Quote", color: "text-yellow-400" },
    like: { icon: <Heart className="h-4 w-4" />, label: "Like", color: "text-red-400" },
  };

  const config = typeConfig[type];

  return (
    <div className={cn(
      "flex items-center gap-3 p-4 rounded-xl bg-dark-elevated border border-dark-border",
      "hover-shimmer transition-colors",
      className
    )}>
      <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg bg-dark-surface", config.color)}>
        {config.icon}
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn("text-sm font-medium", config.color)}>{config.label}</span>
          <span className="text-sm text-foreground-secondary">@{project}</span>
        </div>
        {content && (
          <p className="text-xs text-foreground-secondary truncate mt-0.5">{content}</p>
        )}
      </div>

      <div className="text-right shrink-0">
        <div className="text-lg font-bold text-amplifi-lime">+{points} EP</div>
        <div className="text-xs text-foreground-secondary">{timestamp}</div>
      </div>
    </div>
  );
}

// ============================================
// ENGAGEMENT POINTS LEGEND
// ============================================

export function EngagementPointsLegend({ className }: { className?: string }) {
  const actions = [
    { type: "Quote Tweet", points: 6, icon: <Quote className="h-4 w-4" />, color: "text-yellow-400" },
    { type: "Reply", points: 5, icon: <MessageCircle className="h-4 w-4" />, color: "text-amplifi-purple" },
    { type: "Retweet", points: 3, icon: <Repeat2 className="h-4 w-4" />, color: "text-amplifi-teal" },
    { type: "Like", points: 1, icon: <Heart className="h-4 w-4" />, color: "text-red-400" },
  ];

  return (
    <div className={cn("rounded-2xl border border-dark-border/60 bg-dark-surface/70 backdrop-blur-md p-6 transition-all duration-200 hover-shimmer flex flex-col", className)}>
      <div className="flex items-center gap-2 mb-4">
        <Zap className="h-5 w-5 text-amplifi-lime" />
        <h4 className="text-lg font-semibold text-white">Engagement Points</h4>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {actions.map((action) => (
          <div 
            key={action.type}
            className="flex flex-col items-center p-4 rounded-xl bg-dark-elevated border border-dark-border"
          >
            <div className={cn("mb-2", action.color)}>{action.icon}</div>
            <div className="text-2xl font-bold text-white">{action.points}</div>
            <div className="text-xs text-foreground-secondary">{action.type}</div>
          </div>
        ))}
      </div>

      <p className="text-xs text-foreground-secondary text-center mt-4">
        Points are multiplied by your token holdings and consistency bonus
      </p>
    </div>
  );
}

// ============================================
// VALUE PROPOSITION CARDS
// ============================================

interface ValuePropCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  accent: "lime" | "purple" | "teal";
  className?: string;
}

export function ValuePropCard({ icon, title, description, accent, className }: ValuePropCardProps) {
  const accentStyles = {
    lime: "border-amplifi-lime/20 hover-shimmer",
    purple: "border-amplifi-purple/20 hover-shimmer",
    teal: "border-amplifi-teal/20 hover-shimmer",
  };

  const iconStyles = {
    lime: "bg-amplifi-lime/10 text-amplifi-lime",
    purple: "bg-amplifi-purple/10 text-amplifi-purple",
    teal: "bg-amplifi-teal/10 text-amplifi-teal",
  };

  return (
    <div className={cn(
      "rounded-2xl border bg-dark-surface/70 backdrop-blur-md p-6 transition-all duration-300",
      accentStyles[accent],
      className
    )}>
      <div className={cn("flex h-12 w-12 items-center justify-center rounded-xl mb-4", iconStyles[accent])}>
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
      <p className="text-sm text-foreground-secondary">{description}</p>
    </div>
  );
}

export function ValuePropsSection() {
  return (
    <div className="py-16">
      <div className="text-center mb-12">
        <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">
          Why AmpliFi?
        </h2>
        <p className="text-foreground-secondary max-w-xl mx-auto">
          Replace expensive influencers with your most loyal believers
        </p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
        <ValuePropCard
          icon={<Users className="h-6 w-6" />}
          title="Built-in Marketing Army"
          description="Your holders become your promoters. No negotiations, no upfront costs."
          accent="lime"
        />
        <ValuePropCard
          icon={<Shield className="h-6 w-6" />}
          title="Pay for Real Engagement"
          description="Only verified, organic activity counts. No bots, no fake metrics."
          accent="purple"
        />
        <ValuePropCard
          icon={<Gift className="h-6 w-6" />}
          title="Earn Without Selling"
          description="Holders earn yield by amplifying. No need to dump tokens."
          accent="teal"
        />
      </div>
    </div>
  );
}

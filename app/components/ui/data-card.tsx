"use client";

import { cn } from "@/app/lib/utils";
import { ReactNode } from "react";

interface DataCardProps {
  children: ReactNode;
  className?: string;
  variant?: "default" | "elevated" | "gradient";
  hover?: boolean;
}

export function DataCard({ 
  children, 
  className, 
  variant = "default",
  hover = true 
}: DataCardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-dark-border/60 p-6 transition-all duration-200 backdrop-blur-md",
        variant === "default" && "bg-dark-surface/70",
        variant === "elevated" && "bg-dark-elevated/70",
        variant === "gradient" && "bg-gradient-to-br from-dark-surface/70 to-dark-elevated/70",
        hover && "hover-shimmer",
        className
      )}
    >
      {children}
    </div>
  );
}

interface DataCardHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
}

export function DataCardHeader({ title, subtitle, action, className }: DataCardHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between mb-4", className)}>
      <div>
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        {subtitle && (
          <p className="text-sm text-foreground-secondary mt-0.5">{subtitle}</p>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

interface MetricDisplayProps {
  value: string | number;
  label: string;
  change?: number;
  changeLabel?: string;
  prefix?: string;
  suffix?: string;
  size?: "sm" | "md" | "lg";
  accent?: "lime" | "purple" | "teal" | "default";
  className?: string;
}

export function MetricDisplay({
  value,
  label,
  change,
  changeLabel,
  prefix,
  suffix,
  size = "md",
  accent = "default",
  className,
}: MetricDisplayProps) {
  const isPositive = change && change > 0;
  const isNegative = change && change < 0;

  const accentColors = {
    lime: "text-hodlr-lime",
    purple: "text-hodlr-purple",
    teal: "text-hodlr-teal",
    default: "text-white",
  };

  const sizeClasses = {
    sm: "text-xl",
    md: "text-3xl",
    lg: "text-4xl",
  };

  return (
    <div className={cn("", className)}>
      <div className={cn("font-bold tracking-tight", sizeClasses[size], accentColors[accent])}>
        {prefix}{value}{suffix}
      </div>
      <div className="flex items-center gap-2 mt-1">
        <span className="text-sm text-foreground-secondary">{label}</span>
        {change !== undefined && (
          <span
            className={cn(
              "text-xs font-medium px-1.5 py-0.5 rounded",
              isPositive && "text-hodlr-lime bg-hodlr-lime/10",
              isNegative && "text-red-400 bg-red-400/10",
              !isPositive && !isNegative && "text-foreground-secondary bg-dark-border"
            )}
          >
            {isPositive && "+"}
            {change}%{changeLabel && ` ${changeLabel}`}
          </span>
        )}
      </div>
    </div>
  );
}

interface ExposureStatProps {
  icon: ReactNode;
  value: string | number;
  label: string;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  className?: string;
}

export function ExposureStat({
  icon,
  value,
  label,
  trend,
  trendValue,
  className,
}: ExposureStatProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-dark-border text-foreground-secondary">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold text-white">{value}</span>
          {trend && trendValue && (
            <span
              className={cn(
                "text-xs font-medium",
                trend === "up" && "text-hodlr-lime",
                trend === "down" && "text-red-400",
                trend === "neutral" && "text-foreground-secondary"
              )}
            >
              {trend === "up" && "↑"}
              {trend === "down" && "↓"}
              {trendValue}
            </span>
          )}
        </div>
        <div className="text-xs text-foreground-secondary truncate">{label}</div>
      </div>
    </div>
  );
}

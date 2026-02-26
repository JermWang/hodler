"use client";

import { cn } from "@/app/lib/utils";
import { ReactNode } from "react";
import { Clock } from "lucide-react";

interface ActivityItemProps {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  value?: string;
  valueColor?: "lime" | "purple" | "teal" | "default";
  timestamp: string;
  className?: string;
}

export function ActivityItem({
  icon,
  title,
  subtitle,
  value,
  valueColor = "default",
  timestamp,
  className,
}: ActivityItemProps) {
  const valueColors = {
    lime: "text-hodlr-lime",
    purple: "text-hodlr-purple",
    teal: "text-hodlr-teal",
    default: "text-white",
  };

  return (
    <div
      className={cn(
        "flex items-center gap-3 py-3 border-b border-dark-border/50 last:border-0",
        "transition-colors hover:bg-dark-elevated/30",
        className
      )}
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-dark-border text-foreground-secondary shrink-0">
        {icon}
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-white truncate">{title}</span>
          {value && (
            <span className={cn("text-sm font-semibold", valueColors[valueColor])}>
              {value}
            </span>
          )}
        </div>
        {subtitle && (
          <p className="text-xs text-foreground-secondary truncate">{subtitle}</p>
        )}
      </div>

      <div className="flex items-center gap-1 text-xs text-foreground-muted shrink-0">
        <Clock className="h-3 w-3" />
        {timestamp}
      </div>
    </div>
  );
}

interface ActivityFeedProps {
  children: ReactNode;
  className?: string;
}

export function ActivityFeed({ children, className }: ActivityFeedProps) {
  return (
    <div className={cn("", className)}>
      {children}
    </div>
  );
}

interface StatusBadgeProps {
  status: "active" | "pending" | "completed" | "top" | "trending" | "new";
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const styles = {
    active: "bg-hodlr-lime/10 text-hodlr-lime border-hodlr-lime/20",
    pending: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    completed: "bg-hodlr-teal/10 text-hodlr-teal border-hodlr-teal/20",
    top: "bg-gradient-to-r from-yellow-500/20 to-amber-500/20 text-yellow-400 border-yellow-500/30",
    trending: "bg-hodlr-purple/10 text-hodlr-purple border-hodlr-purple/20",
    new: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  };

  const labels = {
    active: "Active",
    pending: "Pending",
    completed: "Completed",
    top: "Top Earner",
    trending: "Trending",
    new: "New",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border",
        styles[status],
        className
      )}
    >
      {labels[status]}
    </span>
  );
}

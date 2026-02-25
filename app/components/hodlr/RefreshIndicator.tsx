"use client";

import { cn } from "@/app/lib/utils";
import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

interface RefreshIndicatorProps {
  lastUpdatedUnix?: number;
  onRefresh?: () => void | Promise<void>;
  autoRefreshSeconds?: number;
  className?: string;
}

function formatAgo(unix: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - unix;
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function RefreshIndicator({
  lastUpdatedUnix,
  onRefresh,
  autoRefreshSeconds,
  className,
}: RefreshIndicatorProps) {
  const [refreshing, setRefreshing] = useState(false);
  const [agoText, setAgoText] = useState(() => (lastUpdatedUnix ? formatAgo(lastUpdatedUnix) : ""));

  useEffect(() => {
    if (!lastUpdatedUnix) return;
    setAgoText(formatAgo(lastUpdatedUnix));
    const interval = setInterval(() => setAgoText(formatAgo(lastUpdatedUnix)), 5000);
    return () => clearInterval(interval);
  }, [lastUpdatedUnix]);

  useEffect(() => {
    if (!autoRefreshSeconds || !onRefresh) return;
    const interval = setInterval(() => {
      void onRefresh();
    }, autoRefreshSeconds * 1000);
    return () => clearInterval(interval);
  }, [autoRefreshSeconds, onRefresh]);

  const handleRefresh = useCallback(async () => {
    if (!onRefresh || refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh, refreshing]);

  return (
    <div className={cn("flex items-center gap-2 text-xs text-[#9AA3B2]", className)}>
      {lastUpdatedUnix ? (
        <span>Updated {agoText}</span>
      ) : (
        <span>Loading...</span>
      )}
      {onRefresh && (
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="p-1 rounded hover:bg-white/5 transition-colors disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
        </button>
      )}
    </div>
  );
}

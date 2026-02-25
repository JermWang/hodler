"use client";

import { cn } from "@/app/lib/utils";
import { ReactNode } from "react";

interface TopStripProps {
  children: ReactNode;
  className?: string;
}

export function TopStrip({ children, className }: TopStripProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 px-4 py-3 rounded-lg border border-white/[0.06] bg-white/[0.02]",
        className
      )}
    >
      {children}
    </div>
  );
}

interface TopStripItemProps {
  label: string;
  value: ReactNode;
  className?: string;
}

export function TopStripItem({ label, value, className }: TopStripItemProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="text-xs text-[#9AA3B2]">{label}</span>
      <span className="text-sm font-medium text-white">{value}</span>
    </div>
  );
}

interface TopStripDividerProps {
  className?: string;
}

export function TopStripDivider({ className }: TopStripDividerProps) {
  return <div className={cn("w-px h-4 bg-white/10", className)} />;
}

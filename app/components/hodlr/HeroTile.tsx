"use client";

import { cn } from "@/app/lib/utils";
import { ReactNode } from "react";

interface HeroTileProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: ReactNode;
  className?: string;
  trend?: { value: number; label?: string };
}

export function HeroTile({ title, value, subtitle, icon, className, trend }: HeroTileProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 p-4 rounded-lg border border-white/[0.06] bg-white/[0.02]",
        className
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[#9AA3B2] uppercase tracking-wider">{title}</span>
        {icon && <span className="text-[#9AA3B2]">{icon}</span>}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold font-mono text-white">{value}</span>
        {trend && (
          <span
            className={cn(
              "text-xs font-medium",
              trend.value > 0 && "text-emerald-400",
              trend.value < 0 && "text-red-400",
              trend.value === 0 && "text-[#9AA3B2]"
            )}
          >
            {trend.value > 0 ? "+" : ""}
            {trend.value}%{trend.label ? ` ${trend.label}` : ""}
          </span>
        )}
      </div>
      {subtitle && <span className="text-xs text-[#9AA3B2]">{subtitle}</span>}
    </div>
  );
}

interface HeroTileRowProps {
  children: ReactNode;
  className?: string;
}

export function HeroTileRow({ children, className }: HeroTileRowProps) {
  return (
    <div className={cn("grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3", className)}>
      {children}
    </div>
  );
}

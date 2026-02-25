"use client";

import { cn } from "@/app/lib/utils";
import { ReactNode } from "react";

type BadgeVariant = "default" | "success" | "warning" | "danger" | "muted";

interface StatBadgeProps {
  label: string;
  icon?: ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-white/[0.06] text-white/70 border-white/[0.07]",
  success: "bg-[#B6F04A]/10 text-[#B6F04A] border-[#B6F04A]/20",
  warning: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  danger: "bg-red-500/10 text-red-400 border-red-500/20",
  muted: "bg-white/[0.03] text-white/30 border-white/[0.04]",
};

export function StatBadge({ label, icon, variant = "default", className }: StatBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-bold border",
        variantStyles[variant],
        className
      )}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      {label}
    </span>
  );
}

type PillVariant = "default" | "success" | "warning" | "danger" | "muted";

interface StatPillProps {
  label: string;
  value: string | number;
  variant?: PillVariant;
  className?: string;
}

const pillValueStyles: Record<PillVariant, string> = {
  default: "text-white",
  success: "text-[#B6F04A]",
  warning: "text-amber-400",
  danger: "text-red-400",
  muted: "text-white/30",
};

export function StatPill({ label, value, variant = "default", className }: StatPillProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.025] border border-white/[0.06] text-xs",
        className
      )}
    >
      <span className="text-white/30 font-medium">{label}</span>
      <span className={cn("font-mono font-black tabular-nums", pillValueStyles[variant])}>{value}</span>
    </div>
  );
}

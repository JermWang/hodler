"use client";

import { cn } from "@/app/lib/utils";
import { ReactNode } from "react";

type BadgeVariant = "default" | "success" | "warning" | "danger" | "muted";

interface StatBadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  className?: string;
  icon?: ReactNode;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-white/5 text-white border-white/10",
  success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  warning: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  danger: "bg-red-500/10 text-red-400 border-red-500/20",
  muted: "bg-white/[0.03] text-[#9AA3B2] border-white/5",
};

export function StatBadge({ children, variant = "default", className, icon }: StatBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border",
        variantStyles[variant],
        className
      )}
    >
      {icon}
      {children}
    </span>
  );
}

interface StatPillProps {
  label: string;
  value: string | number;
  variant?: BadgeVariant;
  className?: string;
  mono?: boolean;
}

export function StatPill({ label, value, variant = "default", className, mono = true }: StatPillProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded border",
        variantStyles[variant],
        className
      )}
    >
      <span className="text-[#9AA3B2]">{label}</span>
      <span className={cn("text-white font-semibold", mono && "font-mono")}>{value}</span>
    </div>
  );
}

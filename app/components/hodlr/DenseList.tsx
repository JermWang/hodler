"use client";

import { cn } from "@/app/lib/utils";
import { ReactNode } from "react";

interface DenseListProps {
  children: ReactNode;
  className?: string;
}

export function DenseList({ children, className }: DenseListProps) {
  return (
    <div className={cn("flex flex-col divide-y divide-white/[0.06]", className)}>
      {children}
    </div>
  );
}

interface DenseListRowProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  highlight?: boolean;
}

export function DenseListRow({ children, className, onClick, highlight }: DenseListRowProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-4 px-4 py-2.5 transition-colors",
        "hover:bg-white/[0.03]",
        highlight && "bg-emerald-500/[0.05]",
        onClick && "cursor-pointer",
        className
      )}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

interface DenseListHeaderProps {
  children: ReactNode;
  className?: string;
}

export function DenseListHeader({ children, className }: DenseListHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-4 px-4 py-2 text-xs font-medium text-[#9AA3B2] uppercase tracking-wider bg-white/[0.02]",
        className
      )}
    >
      {children}
    </div>
  );
}

interface DenseListCellProps {
  children: ReactNode;
  className?: string;
  width?: string;
  align?: "left" | "center" | "right";
  mono?: boolean;
}

export function DenseListCell({ children, className, width, align = "left", mono }: DenseListCellProps) {
  return (
    <div
      className={cn(
        "text-sm truncate",
        align === "left" && "text-left",
        align === "center" && "text-center",
        align === "right" && "text-right",
        mono && "font-mono",
        className
      )}
      style={width ? { width, flexShrink: 0 } : { flex: 1 }}
    >
      {children}
    </div>
  );
}

interface DenseListEmptyProps {
  message?: string;
  className?: string;
}

export function DenseListEmpty({ message = "No data", className }: DenseListEmptyProps) {
  return (
    <div className={cn("flex items-center justify-center py-8 text-sm text-[#9AA3B2]", className)}>
      {message}
    </div>
  );
}

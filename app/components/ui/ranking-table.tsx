"use client";

import { cn } from "@/app/lib/utils";
import { ReactNode } from "react";
import { ChevronUp, ChevronDown, Minus } from "lucide-react";

interface RankingTableProps {
  children: ReactNode;
  className?: string;
}

export function RankingTable({ children, className }: RankingTableProps) {
  return (
    <div className={cn("w-full overflow-x-auto", className)}>
      <table className="w-full border-collapse">
        {children}
      </table>
    </div>
  );
}

interface RankingTableHeaderProps {
  children: ReactNode;
  className?: string;
}

export function RankingTableHeader({ children, className }: RankingTableHeaderProps) {
  return (
    <thead className={cn("", className)}>
      <tr className="border-b border-dark-border">
        {children}
      </tr>
    </thead>
  );
}

interface RankingTableHeadProps {
  children: ReactNode;
  className?: string;
  sortable?: boolean;
  sorted?: "asc" | "desc" | null;
  onSort?: () => void;
  align?: "left" | "center" | "right";
}

export function RankingTableHead({
  children,
  className,
  sortable,
  sorted,
  onSort,
  align = "left",
}: RankingTableHeadProps) {
  return (
    <th
      className={cn(
        "px-4 py-3 text-xs font-medium uppercase tracking-wider text-foreground-secondary",
        align === "left" && "text-left",
        align === "center" && "text-center",
        align === "right" && "text-right",
        sortable && "cursor-pointer hover:text-white transition-colors",
        className
      )}
      onClick={sortable ? onSort : undefined}
    >
      <div className={cn(
        "flex items-center gap-1",
        align === "center" && "justify-center",
        align === "right" && "justify-end"
      )}>
        {children}
        {sortable && (
          <span className="text-foreground-muted">
            {sorted === "asc" && <ChevronUp className="h-3 w-3" />}
            {sorted === "desc" && <ChevronDown className="h-3 w-3" />}
            {!sorted && <Minus className="h-3 w-3 opacity-30" />}
          </span>
        )}
      </div>
    </th>
  );
}

interface RankingTableBodyProps {
  children: ReactNode;
  className?: string;
}

export function RankingTableBody({ children, className }: RankingTableBodyProps) {
  return <tbody className={cn("", className)}>{children}</tbody>;
}

interface RankingTableRowProps {
  children: ReactNode;
  className?: string;
  highlight?: boolean;
  onClick?: () => void;
}

export function RankingTableRow({ 
  children, 
  className, 
  highlight,
  onClick 
}: RankingTableRowProps) {
  return (
    <tr
      className={cn(
        "border-b border-dark-border/50 transition-colors",
        "hover:bg-dark-elevated/50",
        highlight && "bg-amplifi-lime/5",
        onClick && "cursor-pointer",
        className
      )}
      onClick={onClick}
    >
      {children}
    </tr>
  );
}

interface RankingTableCellProps {
  children: ReactNode;
  className?: string;
  align?: "left" | "center" | "right";
}

export function RankingTableCell({ 
  children, 
  className,
  align = "left" 
}: RankingTableCellProps) {
  return (
    <td
      className={cn(
        "px-4 py-3 text-sm",
        align === "left" && "text-left",
        align === "center" && "text-center",
        align === "right" && "text-right",
        className
      )}
    >
      {children}
    </td>
  );
}

interface RankBadgeProps {
  rank: number;
  className?: string;
}

export function RankBadge({ rank, className }: RankBadgeProps) {
  const isTop3 = rank <= 3;
  
  const colors = {
    1: "bg-gradient-to-br from-yellow-400 to-yellow-600 text-black",
    2: "bg-gradient-to-br from-gray-300 to-gray-500 text-black",
    3: "bg-gradient-to-br from-amber-600 to-amber-800 text-white",
  };

  return (
    <div
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold",
        isTop3 ? colors[rank as 1 | 2 | 3] : "bg-dark-border text-foreground-secondary",
        className
      )}
    >
      {rank}
    </div>
  );
}

interface TrendIndicatorProps {
  value: number;
  suffix?: string;
  className?: string;
}

export function TrendIndicator({ value, suffix = "%", className }: TrendIndicatorProps) {
  const isPositive = value > 0;
  const isNegative = value < 0;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-sm font-medium",
        isPositive && "text-amplifi-lime",
        isNegative && "text-red-400",
        !isPositive && !isNegative && "text-foreground-secondary",
        className
      )}
    >
      {isPositive && <ChevronUp className="h-3 w-3" />}
      {isNegative && <ChevronDown className="h-3 w-3" />}
      {Math.abs(value)}{suffix}
    </span>
  );
}

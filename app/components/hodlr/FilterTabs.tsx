"use client";

import { cn } from "@/app/lib/utils";
import { ReactNode } from "react";

interface FilterTab {
  id: string;
  label: string;
  icon?: ReactNode;
  color?: "green" | "red" | "yellow" | "default";
}

interface FilterTabsProps {
  tabs: FilterTab[];
  activeTab: string;
  onTabChange: (id: string) => void;
  className?: string;
}

const colorStyles = {
  green: "bg-emerald-500 text-black",
  red: "bg-red-500 text-white",
  yellow: "bg-yellow-500 text-black",
  default: "bg-white/[0.08] text-white",
};

export function FilterTabs({ tabs, activeTab, onTabChange, className }: FilterTabsProps) {
  return (
    <div className={cn("flex items-center gap-2 flex-wrap", className)}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const color = tab.color || "default";
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
              isActive ? colorStyles[color] : "bg-transparent text-[#9AA3B2] hover:bg-white/[0.04]"
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

interface FilterTabsStaticProps {
  children: ReactNode;
  className?: string;
}

export function FilterTabsStatic({ children, className }: FilterTabsStaticProps) {
  return (
    <div className={cn("flex items-center gap-2 flex-wrap", className)}>
      {children}
    </div>
  );
}

interface FilterPillProps {
  active?: boolean;
  color?: "green" | "red" | "yellow" | "default";
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}

export function FilterPill({ active, color = "green", children, onClick, className }: FilterPillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
        active ? colorStyles[color] : "bg-transparent text-[#9AA3B2] hover:bg-white/[0.04]",
        className
      )}
    >
      {children}
    </button>
  );
}

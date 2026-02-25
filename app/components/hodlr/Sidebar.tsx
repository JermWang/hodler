"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Home, Trophy, Coins, Gift, FileText, LayoutDashboard } from "lucide-react";
import { cn } from "@/app/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/board", label: "Board", icon: LayoutDashboard },
  { href: "/leaderboards", label: "Leaderboards", icon: Trophy },
  { href: "/distributions", label: "Distributions", icon: Coins },
  { href: "/claims", label: "Claims", icon: Gift },
];

const SECONDARY_ITEMS = [
  { href: "/docs", label: "Docs", icon: FileText },
];

export function Sidebar() {
  const pathname = usePathname() ?? "/";

  return (
    <aside className="fixed left-0 top-0 z-50 h-screen w-[180px] border-r border-white/[0.06] bg-[#0e0e10] hidden lg:flex lg:flex-col">
      {/* Logo - aligned with header height */}
      <div className="h-14 px-4 flex items-center border-b border-white/[0.06]">
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/logo-with-bg-white.png"
            alt="HODLR"
            width={32}
            height={32}
            className="h-8 w-8 rounded-lg"
            priority
          />
          <span className="text-white font-bold text-lg">HODLR</span>
        </Link>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const isActive = item.href === "/" ? pathname === "/" : (pathname === item.href || pathname.startsWith(item.href + "/"));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-emerald-500/10 text-emerald-400 border-l-2 border-emerald-500"
                  : "text-[#9AA3B2] hover:bg-white/[0.04] hover:text-white"
              )}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
        
        <div className="h-px bg-white/[0.06] my-3" />
        
        {SECONDARY_ITEMS.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-emerald-500/10 text-emerald-400"
                  : "text-[#9AA3B2] hover:bg-white/[0.04] hover:text-white"
              )}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="p-2 border-t border-white/[0.06]">
        <div className="px-3 py-2 rounded-lg bg-white/[0.02]">
          <div className="text-xs text-[#9AA3B2] mb-1">Current Epoch</div>
          <div className="text-sm font-mono text-emerald-400">-</div>
        </div>
      </div>
    </aside>
  );
}

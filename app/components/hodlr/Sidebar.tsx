"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Home, Trophy, Coins, Gift, FileText, LayoutDashboard, Rocket } from "lucide-react";
import { cn } from "@/app/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/launch", label: "Launch", icon: Rocket },
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
    <aside className="fixed left-0 top-0 z-50 h-screen w-[220px] border-r border-white/[0.05] bg-[#080809] hidden lg:flex lg:flex-col">
      {/* Logo */}
      <div className="h-[52px] px-5 flex items-center border-b border-white/[0.05]">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="relative">
            <Image
              src="/logo-with-bg-white.png"
              alt="HODLR"
              width={30}
              height={30}
              className="h-[30px] w-[30px] rounded-lg"
              priority
            />
            <div className="absolute inset-0 rounded-lg bg-[#B6F04A]/0 group-hover:bg-[#B6F04A]/10 transition-colors" />
          </div>
          <span className="text-white font-black tracking-tight text-[17px] leading-none">HODLR</span>
        </Link>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 px-3 py-5 space-y-0.5">
        <div className="mb-2 px-2">
          <span className="text-[10px] font-bold tracking-[0.15em] uppercase text-white/20">Menu</span>
        </div>
        {NAV_ITEMS.map((item) => {
          const isActive = item.href === "/" ? pathname === "/" : (pathname === item.href || pathname.startsWith(item.href + "/"));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-150",
                isActive
                  ? "bg-[#B6F04A]/10 text-[#B6F04A]"
                  : "text-white/40 hover:bg-white/[0.04] hover:text-white/80"
              )}
            >
              <Icon className={cn("h-4 w-4 flex-shrink-0", isActive ? "text-[#B6F04A]" : "text-white/30")} />
              {item.label}
              {isActive && <div className="ml-auto w-1 h-1 rounded-full bg-[#B6F04A]" />}
            </Link>
          );
        })}

        <div className="h-px bg-white/[0.05] my-4" />

        <div className="mb-2 px-2">
          <span className="text-[10px] font-bold tracking-[0.15em] uppercase text-white/20">Resources</span>
        </div>
        {SECONDARY_ITEMS.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-150",
                isActive
                  ? "bg-[#B6F04A]/10 text-[#B6F04A]"
                  : "text-white/40 hover:bg-white/[0.04] hover:text-white/80"
              )}
            >
              <Icon className={cn("h-4 w-4 flex-shrink-0", isActive ? "text-[#B6F04A]" : "text-white/30")} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="p-3 border-t border-white/[0.05]">
        <div className="px-3 py-3 rounded-xl bg-[#B6F04A]/[0.06] border border-[#B6F04A]/[0.12]">
          <div className="text-[10px] font-bold tracking-widest uppercase text-[#B6F04A]/50 mb-1">Current Epoch</div>
          <div className="text-sm font-mono font-bold text-[#B6F04A]" id="sidebar-epoch">-</div>
        </div>
      </div>
    </aside>
  );
}

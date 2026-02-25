"use client";

import { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { Sidebar } from "./Sidebar";
import { Search, Bell } from "lucide-react";
import AsciiBackground from "../AsciiBackground";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((mod) => mod.WalletMultiButton),
  { ssr: false }
);

interface HodlrLayoutProps {
  children: ReactNode;
}

export function HodlrLayout({ children }: HodlrLayoutProps) {
  return (
    <div className="min-h-screen bg-[#0e0e10] relative">
      {/* ASCII Background */}
      <AsciiBackground />
      
      <Sidebar />
      
      {/* Top Header Bar */}
      <header className="fixed top-0 left-0 lg:left-[180px] right-0 z-40 h-14 border-b border-white/[0.06] bg-[#0e0e10]/95 backdrop-blur-sm">
        <div className="h-full px-4 flex items-center justify-between">
          {/* Mobile Logo */}
          <div className="flex items-center gap-3 lg:hidden">
            <Link href="/board" className="flex items-center gap-2">
              <Image
                src="/logo-with-bg-white.png"
                alt="HODLR"
                width={32}
                height={32}
                className="h-8 w-8 rounded-lg"
                priority
              />
              <span className="text-white font-bold">HODLR</span>
            </Link>
          </div>
          
          {/* Search Bar */}
          <div className="hidden md:flex flex-1 max-w-md">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9AA3B2]" />
              <input
                type="text"
                placeholder="Search wallets, epochs..."
                className="w-full h-9 pl-10 pr-4 rounded-lg bg-white/[0.04] border border-white/[0.06] text-sm text-white placeholder:text-[#9AA3B2] focus:outline-none focus:border-emerald-500/50"
              />
            </div>
          </div>
          
          {/* Right side */}
          <div className="flex items-center gap-3">
            <button className="p-2 rounded-lg hover:bg-white/[0.04] text-[#9AA3B2] hover:text-white transition-colors">
              <Bell className="h-5 w-5" />
            </button>
            <WalletMultiButton className="!bg-emerald-500 hover:!bg-emerald-600 !text-black !font-medium !text-sm !h-9 !rounded-lg" />
          </div>
        </div>
      </header>
      
      {/* Main Content */}
      <div className="lg:pl-[180px] pt-14 relative z-10">
        {children}
      </div>
    </div>
  );
}

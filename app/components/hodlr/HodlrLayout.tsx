"use client";

import { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { Sidebar } from "./Sidebar";
import { AsciiMathBackground } from "./AsciiMathBackground";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((mod) => mod.WalletMultiButton),
  { ssr: false }
);

interface HodlrLayoutProps {
  children: ReactNode;
}

export function HodlrLayout({ children }: HodlrLayoutProps) {
  return (
    <div className="min-h-screen bg-[#080809] relative">
      <AsciiMathBackground />

      <Sidebar />

      {/* Top Header Bar */}
      <header className="fixed top-0 left-0 lg:left-[220px] right-0 z-40 h-[52px] border-b border-white/[0.05] bg-[#080809]/90 backdrop-blur-md">
        <div className="h-full px-5 flex items-center justify-between">
          {/* Mobile Logo */}
          <div className="flex items-center gap-3 lg:hidden">
            <Link href="/" className="flex items-center gap-2.5">
              <Image
                src="/logo-with-bg-white.png"
                alt="HODLR"
                width={28}
                height={28}
                className="h-7 w-7 rounded-md"
                priority
              />
              <span className="text-white font-black tracking-tight text-base">HODLR</span>
            </Link>
          </div>

          {/* Center - page title placeholder for mobile */}
          <div className="lg:flex-1" />

          {/* Right side */}
          <div className="flex items-center gap-2.5">
            <WalletMultiButton className="!bg-[#B6F04A] hover:!bg-[#c8f560] !text-black !font-bold !text-xs !h-8 !rounded-lg !px-3 !tracking-wide" />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="lg:pl-[220px] pt-[52px] relative z-10">
        {children}
      </div>
    </div>
  );
}

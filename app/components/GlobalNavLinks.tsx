"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

export default function GlobalNavLinks() {
  const pathname = usePathname() ?? "/";
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <nav className="flex items-center gap-4" aria-label="Global">
      {/* Desktop: Twitter, Dashboard, Wallet */}
      <div className="hidden md:flex items-center gap-4">
        <a
          className="text-sm text-foreground-secondary hover:text-white transition-colors"
          href="https://x.com/AmpliFiSocial"
          target="_blank"
          rel="noreferrer noopener"
        >
          @AmpliFiSocial
        </a>
        <Link
          href="/dashboard"
          className={`text-sm transition-colors ${
            pathname === "/dashboard" || pathname.startsWith("/dashboard") || pathname === "/holder" || pathname === "/creator"
              ? "text-amplifi-lime"
              : "text-foreground-secondary hover:text-white"
          }`}
        >
          Dashboard
        </Link>
        <WalletMultiButton />
      </div>

      {/* Mobile */}
      <div className="flex md:hidden items-center gap-3">
        <button
          type="button"
          className="p-2 text-foreground-secondary hover:text-white"
          aria-label="Menu"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((v) => !v)}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d={mobileOpen ? "M6 18L18 6M6 6l12 12" : "M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2z"} />
          </svg>
        </button>
        <WalletMultiButton />
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="absolute top-14 left-0 right-0 bg-dark-elevated border-b border-dark-border p-4 md:hidden shadow-lg">
          <div className="flex flex-col gap-2">
            <Link
              href="/discover"
              className={`text-sm border-l-2 pl-3 py-2 transition-colors ${
                pathname === "/discover" || pathname.startsWith("/discover/")
                  ? "text-amplifi-lime border-amplifi-lime"
                  : "text-foreground-secondary border-transparent hover:text-white"
              }`}
              onClick={() => setMobileOpen(false)}
            >
              Discover
            </Link>
            <Link
              href="/campaigns"
              className={`text-sm border-l-2 pl-3 py-2 transition-colors ${
                pathname === "/campaigns" || pathname.startsWith("/campaigns/")
                  ? "text-amplifi-lime border-amplifi-lime"
                  : "text-foreground-secondary border-transparent hover:text-white"
              }`}
              onClick={() => setMobileOpen(false)}
            >
              Campaigns
            </Link>
            <Link
              href="/launch"
              className={`text-sm border-l-2 pl-3 py-2 transition-colors ${
                pathname === "/launch" || pathname.startsWith("/launch/")
                  ? "text-amplifi-lime border-amplifi-lime"
                  : "text-foreground-secondary border-transparent hover:text-white"
              }`}
              onClick={() => setMobileOpen(false)}
            >
              Launch
            </Link>
            <Link
              href="/dashboard"
              className={`text-sm border-l-2 pl-3 py-2 transition-colors ${
                pathname === "/dashboard" || pathname.startsWith("/dashboard") || pathname === "/holder" || pathname === "/creator"
                  ? "text-amplifi-lime border-amplifi-lime"
                  : "text-foreground-secondary border-transparent hover:text-white"
              }`}
              onClick={() => setMobileOpen(false)}
            >
              Dashboard
            </Link>
            <a
              className="text-sm text-foreground-secondary hover:text-white"
              href="https://x.com/AmpliFiSocial"
              target="_blank"
              rel="noreferrer noopener"
            >
              @AmpliFiSocial
            </a>
          </div>
        </div>
      )}
    </nav>
  );
}

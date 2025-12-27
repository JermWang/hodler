"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

type ActiveTab = "landing" | "discover" | "commit";

function getActiveTab(pathname: string, tabParam: string | null): ActiveTab {
  if (pathname.startsWith("/commit")) return "commit";

  const raw = (tabParam ?? "").toLowerCase();
  if (raw === "discover") return "discover";
  if (raw === "commit") return "commit";
  return "landing";
}

export default function GlobalNavLinks() {
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();

  const active = getActiveTab(pathname, searchParams?.get("tab") ?? null);

  return (
    <nav className="globalNavLinks" aria-label="Global">
      <Link className={`globalNavLink${active === "landing" ? " globalNavLinkPrimary" : ""}`} href="/" aria-current={active === "landing" ? "page" : undefined}>
        Landing
      </Link>
      <Link
        className={`globalNavLink${active === "discover" ? " globalNavLinkPrimary" : ""}`}
        href="/?tab=discover"
        aria-current={active === "discover" ? "page" : undefined}
      >
        Discover
      </Link>
      <Link
        className={`globalNavLink${active === "commit" ? " globalNavLinkPrimary" : ""}`}
        href="/?tab=commit"
        aria-current={active === "commit" ? "page" : undefined}
      >
        Commit
      </Link>
      <WalletMultiButton />
    </nav>
  );
}

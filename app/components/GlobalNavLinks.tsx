"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

type ActiveTab = "landing" | "discover" | "commit" | "docs";

function getActiveTab(pathname: string, tabParam: string | null): ActiveTab {
  if (pathname.startsWith("/docs")) return "docs";
  if (pathname.startsWith("/commit")) return "commit";

  const raw = (tabParam ?? "").toLowerCase();
  if (raw === "discover") return "discover";
  if (raw === "commit") return "commit";
  return "landing";
}

function Icon(props: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" className="globalNavIcon">
      <path d={props.d} fill="currentColor" />
    </svg>
  );
}

export default function GlobalNavLinks() {
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();

  const active = getActiveTab(pathname, searchParams?.get("tab") ?? null);

  return (
    <nav className="globalNavLinks" aria-label="Global">
      <Link
        className={`globalNavIconBtn${active === "landing" ? " globalNavIconBtnActive" : ""}`}
        href="/"
        aria-current={active === "landing" ? "page" : undefined}
        aria-label="Landing"
        title="Landing"
      >
        <Icon d="M12 3l9 8h-3v9h-5v-6H11v6H6v-9H3l9-8z" />
      </Link>
      <Link
        className={`globalNavIconBtn${active === "discover" ? " globalNavIconBtnActive" : ""}`}
        href="/?tab=discover"
        aria-current={active === "discover" ? "page" : undefined}
        aria-label="Discover"
        title="Discover"
      >
        <Icon d="M3 5h18v2H3V5zm0 6h18v2H3v-2zm0 6h18v2H3v-2z" />
      </Link>
      <Link
        className={`globalNavIconBtn${active === "commit" ? " globalNavIconBtnActive" : ""}`}
        href="/?tab=commit"
        aria-current={active === "commit" ? "page" : undefined}
        aria-label="Commit"
        title="Commit"
      >
        <Icon d="M19 21H9c-1.1 0-2-.9-2-2v-1h2v1h10V5H9v1H7V5c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2v14c0 1.1-.9 2-2 2zM11 17l-1.4-1.4L12.2 13H3v-2h9.2L9.6 8.4 11 7l6 6-6 6z" />
      </Link>
      <Link
        className={`globalNavIconBtn${active === "docs" ? " globalNavIconBtnActive" : ""}`}
        href="/docs/platform-overview"
        aria-current={active === "docs" ? "page" : undefined}
        aria-label="Platform overview"
        title="Platform overview"
      >
        <Icon d="M6 2h11a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm0 2v16h11V4H6zm2 2h7v2H8V6zm0 4h7v2H8v-2zm0 4h5v2H8v-2z" />
      </Link>
      <WalletMultiButton />
    </nav>
  );
}

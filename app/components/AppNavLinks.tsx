"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/discover", label: "Discover" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/launch", label: "Launch" },
  { href: "/docs", label: "Docs" },
];

function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AppNavLinks() {
  const pathname = usePathname() ?? "/";

  return (
    <nav className="hidden md:flex items-center gap-6" aria-label="Primary">
      {NAV_ITEMS.map((item) => {
        const active = isActivePath(pathname, item.href);
        const isLaunch = item.href === "/launch";

        if (isLaunch) {
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`hover-shimmer text-sm font-semibold px-3 py-1.5 rounded-xl border border-dark-border/60 bg-dark-surface/70 transition-all duration-200 ${
                active ? "text-white" : "text-white"
              }`}
            >
              {item.label}
            </Link>
          );
        }
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`text-sm font-medium transition-colors border-b-2 pb-1 ${
              active
                ? "text-amplifi-lime border-amplifi-lime"
                : "text-foreground-secondary border-transparent hover:text-white"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

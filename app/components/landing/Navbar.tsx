"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/app/components/ui/button";
import { Menu, X } from "lucide-react";

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-white/80 backdrop-blur-lg border-b border-border shadow-sm"
          : "bg-transparent"
      }`}
    >
      <div className="mx-auto max-w-layout px-6">
        <nav className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amplifi-blue">
              <span className="text-lg font-bold text-white">A</span>
            </div>
            <span className={`text-xl font-bold ${scrolled ? "text-foreground" : "text-foreground"}`}>
              AmpliFi
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            <Link
              href="/docs"
              className={`text-sm font-medium transition-colors hover:text-amplifi-blue ${
                scrolled ? "text-foreground-muted" : "text-foreground-muted"
              }`}
            >
              Docs
            </Link>
            <Link
              href="/transparency"
              className={`text-sm font-medium transition-colors hover:text-amplifi-blue ${
                scrolled ? "text-foreground-muted" : "text-foreground-muted"
              }`}
            >
              Transparency
            </Link>
            <Link
              href="/community"
              className={`text-sm font-medium transition-colors hover:text-amplifi-blue ${
                scrolled ? "text-foreground-muted" : "text-foreground-muted"
              }`}
            >
              Community
            </Link>
            <Button size="default" className="bg-amplifi-lime text-dark-bg hover:bg-amplifi-lime/90">
              Launch App
            </Button>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? (
              <X className="h-6 w-6" />
            ) : (
              <Menu className="h-6 w-6" />
            )}
          </button>
        </nav>

        {/* Mobile Navigation */}
        {mobileOpen && (
          <div className="md:hidden py-4 border-t border-border">
            <div className="flex flex-col gap-4">
              <Link
                href="/docs"
                className="text-sm font-medium text-foreground-muted hover:text-amplifi-blue"
                onClick={() => setMobileOpen(false)}
              >
                Docs
              </Link>
              <Link
                href="/transparency"
                className="text-sm font-medium text-foreground-muted hover:text-amplifi-blue"
                onClick={() => setMobileOpen(false)}
              >
                Transparency
              </Link>
              <Link
                href="/community"
                className="text-sm font-medium text-foreground-muted hover:text-amplifi-blue"
                onClick={() => setMobileOpen(false)}
              >
                Community
              </Link>
              <Button size="default" className="w-full bg-amplifi-lime text-dark-bg hover:bg-amplifi-lime/90">
                Launch App
              </Button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

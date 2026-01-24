"use client";

import Link from "next/link";
import { PlayCircle } from "lucide-react";
import { useOnboarding } from "@/app/components/OnboardingProvider";

export function Footer() {
  const { resetAndOpenOnboarding } = useOnboarding();

  return (
    <footer className="border-t border-dark-border/60 bg-dark-bg/50 backdrop-blur-sm">
      <div className="mx-auto max-w-[1280px] px-4 md:px-6 py-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Brand */}
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2">
              <img 
                src="/branding/amplifi/AmpliFi-logo-white-logo.png" 
                alt="AmpliFi" 
                className="h-6 w-auto"
              />
              <span className="text-lg font-bold text-white">AmpliFi</span>
            </Link>
            <span className="hidden md:inline text-foreground-muted">|</span>
            <a
              href="https://x.com/AmpliFiSocial"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-foreground-secondary hover:text-amplifi-lime transition-colors"
            >
              @AmpliFiSocial
            </a>
          </div>

          {/* Links */}
          <div className="flex items-center gap-6 text-sm">
            <Link href="/docs" className="text-foreground-secondary hover:text-white transition-colors">
              Docs
            </Link>
            <Link href="/launch" className="text-foreground-secondary hover:text-white transition-colors">
              Launch
            </Link>
            <Link href="/discover" className="text-foreground-secondary hover:text-white transition-colors">
              Discover
            </Link>
            <Link href="/campaigns" className="text-foreground-secondary hover:text-white transition-colors">
              Campaigns
            </Link>
            <button
              type="button"
              onClick={resetAndOpenOnboarding}
              className="flex items-center gap-1.5 text-foreground-secondary hover:text-white transition-colors"
            >
              <PlayCircle className="h-4 w-4" />
              Replay Intro
            </button>
          </div>
        </div>

        {/* Copyright */}
        <div className="mt-6 pt-6 border-t border-dark-border/40 text-center md:text-left">
          <p className="text-xs text-foreground-muted">
            © {new Date().getFullYear()} AmpliFi. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

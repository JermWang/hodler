"use client";

import { Button } from "@/app/components/ui/button";
import { ArrowRight } from "lucide-react";

function XVerifiedBadge({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 22 22" aria-label="Verified account" className={className}>
      <g>
        <path 
          fill="#1D9BF0" 
          d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z"
        />
      </g>
    </svg>
  );
}

function HeroLogo() {
  return (
    <div className="flex items-center gap-4 mb-6">
      {/* Logo Box */}
      <div className="flex h-16 w-16 md:h-20 md:w-20 items-center justify-center rounded-2xl bg-amplifi-blue shadow-lg shadow-amplifi-blue/25">
        <span className="text-4xl md:text-5xl font-bold text-white">A</span>
      </div>
      {/* Brand Name with Verification Badge */}
      <div className="flex items-center gap-2">
        <span className="text-5xl md:text-6xl font-bold text-foreground tracking-tight">
          AmpliFi
        </span>
        <XVerifiedBadge className="h-8 w-8 md:h-10 md:w-10 flex-shrink-0" />
      </div>
    </div>
  );
}

export function HeroSection() {
  return (
    <section className="relative min-h-screen pt-32 pb-20 overflow-hidden bg-background">
      {/* Background Pattern */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 right-0 w-[600px] h-[600px] opacity-30">
          <AsciiWorldMap />
        </div>
      </div>

      <div className="relative mx-auto max-w-layout px-6">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left Content */}
          <div className="flex flex-col gap-6">
            {/* Large Logo with Verification Badge */}
            <HeroLogo />
            
            <h2 className="text-2xl md:text-3xl font-semibold text-foreground-muted leading-snug">
              Turn holders into your{" "}
              <span className="relative inline-block">
                <span className="relative z-10 text-white px-2">marketing</span>
                <span className="absolute inset-0 bg-amplifi-blue rounded-md -skew-x-2" />
              </span>{" "}
              engine
            </h2>
            
            <p className="text-body-lg text-foreground-muted max-w-xl">
              The creator growth protocol that automatically pays token holders 
              for organic marketing activity, verified by onchain ownership and social engagement.
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
              <Button size="lg" className="gap-2">
                Launch App
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button size="lg" variant="outline">
                Read Docs
              </Button>
            </div>

            {/* Quick Stats */}
            <div className="flex gap-8 pt-4">
              <div>
                <div className="text-heading-3 font-bold text-foreground">$2.4M+</div>
                <div className="text-caption text-foreground-muted uppercase tracking-wider">Rewards Distributed</div>
              </div>
              <div>
                <div className="text-heading-3 font-bold text-foreground">12,500+</div>
                <div className="text-caption text-foreground-muted uppercase tracking-wider">Active Holders</div>
              </div>
            </div>
          </div>

          {/* Right Content - Abstract Visualization */}
          <div className="hidden lg:flex justify-center items-center">
            <div className="relative w-full max-w-md aspect-square">
              <div className="absolute inset-0 bg-gradient-radial from-amplifi-blue/20 to-transparent rounded-full animate-pulse" />
              <div className="absolute inset-8 bg-gradient-radial from-amplifi-blue/30 to-transparent rounded-full animate-pulse delay-150" />
              <div className="absolute inset-16 bg-gradient-radial from-amplifi-blue/40 to-transparent rounded-full animate-pulse delay-300" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-8xl font-bold text-amplifi-blue opacity-20">A</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function AsciiWorldMap() {
  const pattern = `
    ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·
  ·  ■  ■  ·  ·  ■  ■  ■  ·  ·  ·  ·  ·
·  ■  ■  ■  ■  ■  ■  ■  ■  ■  ·  ·  ·  ·
  ■  ■  ■  ■  ■  ■  ■  ■  ■  ■  ■  ·  ·
·  ■  ■  ■  ■  ■  ■  ■  ■  ■  ■  ■  ·  ·
  ·  ■  ■  ■  ■  ■  ■  ■  ■  ■  ·  ·  ·
·  ·  ·  ■  ■  ■  ■  ■  ■  ·  ·  ·  ·  ·
  ·  ·  ·  ·  ■  ■  ■  ·  ·  ·  ·  ·  ·
·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·
  `;

  return (
    <pre className="text-amplifi-blue font-mono text-xs leading-tight select-none">
      {pattern}
    </pre>
  );
}

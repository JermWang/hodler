"use client";

import { Button } from "@/app/components/ui/button";
import { ArrowRight } from "lucide-react";

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
          <div className="flex flex-col gap-8">
            <h1 className="text-display-2 md:text-display-1 font-bold text-foreground leading-tight">
              Turn holders into your{" "}
              <span className="relative inline-block">
                <span className="relative z-10 text-white px-2">marketing</span>
                <span className="absolute inset-0 bg-amplifi-blue rounded-md -skew-x-2" />
              </span>{" "}
              engine
            </h1>
            
            <p className="text-body-lg text-foreground-muted max-w-xl">
              AmpliFi is a creator growth protocol that automatically pays token holders 
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

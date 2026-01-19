"use client";

import { Badge } from "@/app/components/ui/badge";
import { StatBlock } from "@/app/components/ui/stat-block";

export function YieldSection() {
  return (
    <section className="relative py-section-desktop bg-black overflow-hidden">
      <div className="mx-auto max-w-layout px-6">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left Content */}
          <div className="flex flex-col gap-6">
            <Badge variant="accent" className="w-fit">
              Rewards
            </Badge>
            
            <h2 className="text-heading-1 font-bold text-white">
              Earn rewards by amplifying projects you believe in
            </h2>
            
            <p className="text-body-lg text-white/70">
              Hold tokens, engage authentically on social media, and earn a share 
              of the reward pool. Your engagement is tracked, scored, and rewarded 
              automatically every epoch.
            </p>

            <div className="flex gap-12 mt-4">
              <StatBlock
                value="$74.05M"
                label="Distributed This Month"
                variant="dark"
              />
              <StatBlock
                value="10.72"
                label="Avg APY"
                suffix="%"
                variant="dark"
              />
            </div>
          </div>

          {/* Right Content - Token Visualization */}
          <div className="flex justify-center items-center">
            <div className="relative">
              {/* Floating Coins */}
              <div className="relative w-64 h-64">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 rounded-full bg-gradient-to-br from-amplifi-blue to-amplifi-navy shadow-glow animate-float" />
                <div className="absolute bottom-0 left-0 w-24 h-24 rounded-full bg-gradient-to-br from-amplifi-orange to-red-600 shadow-glow-accent animate-float delay-150" />
                <div className="absolute bottom-0 right-0 w-28 h-28 rounded-full bg-gradient-to-br from-amplifi-blue to-purple-600 shadow-glow animate-float delay-300" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

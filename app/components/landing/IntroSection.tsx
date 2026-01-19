"use client";

import { Button } from "@/app/components/ui/button";
import { StatBlock } from "@/app/components/ui/stat-block";

export function IntroSection() {
  return (
    <section className="relative py-section-desktop bg-amplifi-blue overflow-hidden">
      {/* Concentric Circle Pattern */}
      <div className="absolute inset-0 flex items-center justify-center opacity-10">
        <div className="absolute w-[800px] h-[800px] border border-white rounded-full" />
        <div className="absolute w-[600px] h-[600px] border border-white rounded-full" />
        <div className="absolute w-[400px] h-[400px] border border-white rounded-full" />
        <div className="absolute w-[200px] h-[200px] border border-white rounded-full" />
      </div>

      <div className="relative mx-auto max-w-layout px-6">
        <div className="flex flex-col items-center text-center gap-8">
          {/* Icon */}
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
            <span className="text-3xl font-bold text-white">A</span>
          </div>

          {/* Content */}
          <div className="max-w-2xl">
            <h2 className="text-heading-1 font-bold text-white mb-4">
              Introducing AmpliFi
            </h2>
            <p className="text-body-lg text-white/80">
              A creator growth protocol that automatically pays your token holders 
              for amplifying your project. Verified engagement, transparent rewards, 
              real results.
            </p>
          </div>

          {/* CTA */}
          <Button 
            size="lg" 
            className="bg-white text-amplifi-blue hover:bg-white/90 hover:text-amplifi-blue-dark"
          >
            Get Started
          </Button>

          {/* Stats */}
          <div className="flex flex-col sm:flex-row gap-12 mt-8">
            <StatBlock
              value="$150.5M"
              label="Total Rewards"
              variant="dark"
            />
            <StatBlock
              value="16,621"
              label="Active Participants"
              variant="dark"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

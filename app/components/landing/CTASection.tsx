"use client";

import { Button } from "@/app/components/ui/button";

export function CTASection() {
  return (
    <section className="py-section-desktop bg-background">
      <div className="mx-auto max-w-layout px-6">
        <div className="flex flex-col items-center text-center gap-8">
          <h2 className="text-heading-1 font-bold text-foreground">
            Ready to amplify your project?
          </h2>
          <p className="text-body-lg text-foreground-muted max-w-xl">
            Join the growing number of projects using AmpliFi to turn their 
            holders into a powerful marketing force.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <Button size="lg">
              Launch a Campaign
            </Button>
            <Button size="lg" variant="outline">
              Contact Us
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

"use client";

import { FeatureCard } from "@/app/components/ui/feature-card";
import { TrendingUp, DollarSign, Zap } from "lucide-react";

export function FeaturesSection() {
  const features = [
    {
      icon: TrendingUp,
      title: "Engagement-Based Rewards",
      description:
        "Earn rewards proportional to your social engagement. Replies, retweets, and quote tweets all contribute to your score.",
      iconBgColor: "bg-amplifi-blue/10",
    },
    {
      icon: DollarSign,
      title: "Token-Weighted Distribution",
      description:
        "Your token holdings amplify your rewards. The more you hold, the more weight your engagement carries in the reward pool.",
      iconBgColor: "bg-green-500/10",
    },
    {
      icon: Zap,
      title: "Automatic Settlement",
      description:
        "Rewards are calculated and distributed automatically at the end of each epoch. No manual claims, no friction.",
      iconBgColor: "bg-amplifi-orange/10",
    },
  ];

  return (
    <section className="py-section-desktop bg-background">
      <div className="mx-auto max-w-layout px-6">
        <div className="text-center mb-16">
          <h2 className="text-heading-1 font-bold text-foreground mb-4">
            How AmpliFi Works
          </h2>
          <p className="text-body-lg text-foreground-muted max-w-2xl mx-auto">
            A simple, transparent system that rewards authentic engagement 
            and aligns incentives between projects and their communities.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {features.map((feature) => (
            <FeatureCard
              key={feature.title}
              icon={feature.icon}
              title={feature.title}
              description={feature.description}
              iconBgColor={feature.iconBgColor}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

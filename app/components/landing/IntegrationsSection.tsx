"use client";

import { IntegrationCard } from "@/app/components/ui/integration-card";

export function IntegrationsSection() {
  const integrations = [
    {
      name: "Twitter/X",
      description: "Track engagement across tweets, replies, retweets, and quote posts in real-time.",
      logo: <XLogo />,
    },
    {
      name: "Solana",
      description: "Native integration with Solana for fast, low-cost reward distributions.",
      logo: <SolanaLogo />,
    },
    {
      name: "Jupiter",
      description: "Seamless token swaps and liquidity access for reward payouts.",
      logo: <JupiterLogo />,
    },
    {
      name: "Phantom",
      description: "Connect your Phantom wallet to verify holdings and claim rewards.",
      logo: <PhantomLogo />,
    },
    {
      name: "Helius",
      description: "Enterprise-grade RPC infrastructure for reliable blockchain data.",
      logo: <HeliusLogo />,
    },
    {
      name: "More Coming",
      description: "Discord, Telegram, and more platforms coming soon.",
      logo: <PlusLogo />,
    },
  ];

  return (
    <section className="py-section-desktop bg-amplifi-navy">
      <div className="mx-auto max-w-layout px-6">
        <div className="text-center mb-16">
          <h2 className="text-heading-1 font-bold text-white mb-4">
            Integrated with the best
          </h2>
          <p className="text-body-lg text-white/70 max-w-2xl mx-auto">
            AmpliFi connects with the tools and platforms you already use, 
            making it easy to start earning rewards.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {integrations.map((integration) => (
            <IntegrationCard
              key={integration.name}
              name={integration.name}
              description={integration.description}
              logo={integration.logo}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function XLogo() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 text-white">
      <path
        fill="currentColor"
        d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
      />
    </svg>
  );
}

function SolanaLogo() {
  return (
    <div className="text-2xl text-white">◎</div>
  );
}

function JupiterLogo() {
  return (
    <div className="text-2xl text-white">♃</div>
  );
}

function PhantomLogo() {
  return (
    <div className="text-2xl">👻</div>
  );
}

function HeliusLogo() {
  return (
    <div className="text-2xl text-white">☀</div>
  );
}

function PlusLogo() {
  return (
    <div className="text-2xl text-white">+</div>
  );
}

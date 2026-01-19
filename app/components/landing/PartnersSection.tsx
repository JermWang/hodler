"use client";

export function PartnersSection() {
  const partners = [
    { name: "Solana", logo: "◎" },
    { name: "Jupiter", logo: "♃" },
    { name: "Raydium", logo: "⚡" },
    { name: "Pump.fun", logo: "🎈" },
    { name: "Phantom", logo: "👻" },
    { name: "Helius", logo: "☀" },
  ];

  return (
    <section className="py-16 bg-background border-y border-border">
      <div className="mx-auto max-w-layout px-6">
        <div className="flex flex-col md:flex-row items-center gap-8">
          <p className="text-caption text-foreground-muted uppercase tracking-wider whitespace-nowrap">
            Building with
          </p>
          <div className="flex flex-wrap justify-center md:justify-start gap-8 md:gap-12">
            {partners.map((partner) => (
              <div
                key={partner.name}
                className="flex items-center gap-2 text-foreground-muted opacity-60 hover:opacity-100 transition-opacity"
              >
                <span className="text-2xl">{partner.logo}</span>
                <span className="text-sm font-medium">{partner.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

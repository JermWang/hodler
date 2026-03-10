"use client";

import { useState } from "react";
import { ExternalLink, Copy, Check, Zap, Flame, Sparkles } from "lucide-react";
import { HodlrLayout } from "@/app/components/hodlr";

// ── TOKEN CONFIG ──────────────────────────────────────────────────────────────
// Populate these fields when the token is live on pump.fun
type Token = {
  name: string;
  ticker: string;
  contractAddress: string;
  description: string;
  imageUrl: string;
  pumpfunUrl: string;
  marketCap: string;
  change: string;
  changePositive: boolean;
  creatorShort: string;
  timeAgo: string;
  featured: boolean;
  tag: "featured" | "new" | "hot";
};

const TOKENS: Token[] = [
  {
    name: "HODLR",
    ticker: "HODLR",
    contractAddress: process.env.NEXT_PUBLIC_TOKEN_CONTRACT_ADDRESS ?? "",
    description:
      "The on-chain loyalty token rewarding diamond hands. Hold longer, earn more. Top holders share a SOL reward pool every epoch.",
    imageUrl: "/pfp.jpg",
    pumpfunUrl: "",
    marketCap: "TBA",
    change: "+0.00%",
    changePositive: true,
    creatorShort: "hodlr.fun",
    timeAgo: "just launched",
    featured: true,
    tag: "featured",
  },
];
// ─────────────────────────────────────────────────────────────────────────────

const TABS = [
  { id: "featured", label: "Featured", icon: Zap },
  { id: "hot",      label: "Hot",      icon: Flame },
  { id: "new",      label: "New",      icon: Sparkles },
] as const;

type Tab = typeof TABS[number]["id"];

function isLive(token: Token) {
  return (
    token.contractAddress &&
    token.contractAddress !== "coming soon" &&
    token.contractAddress !== ""
  );
}

function CopyCA({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  const short = `${address.slice(0, 4)}...${address.slice(-4)}`;
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(address).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
      className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#38BDF8]/10 hover:bg-[#38BDF8]/20 border border-[#38BDF8]/20 transition-all duration-150 active:scale-95"
    >
      <span className="font-mono text-[11px] text-[#38BDF8]">{copied ? "Copied!" : short}</span>
      {copied
        ? <Check className="h-3 w-3 text-[#38BDF8]" />
        : <Copy className="h-3 w-3 text-[#38BDF8]/50" />}
    </button>
  );
}

function FeaturedStrip({ tokens }: { tokens: Token[] }) {
  const featured = tokens.filter((t) => t.featured);
  if (!featured.length) return null;

  return (
    <div>
      <h2 className="text-[13px] font-bold text-white/50 tracking-widest uppercase mb-3">Featured</h2>
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
        {featured.map((token) => (
          <a
            key={token.ticker}
            href={token.pumpfunUrl || "#"}
            target={token.pumpfunUrl ? "_blank" : undefined}
            rel="noopener noreferrer"
            className="relative flex-shrink-0 w-[200px] h-[155px] rounded-xl overflow-hidden border border-white/10 hover:border-[#38BDF8]/40 transition-all duration-200 group cursor-pointer"
          >
            <img
              src={token.imageUrl}
              alt={token.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />

            {/* Featured badge */}
            <div className="absolute top-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[#FACC15]/20 border border-[#FACC15]/40 backdrop-blur-sm">
              <Zap className="h-2.5 w-2.5 text-[#FACC15]" />
              <span className="text-[9px] font-bold text-[#FACC15] uppercase tracking-wider">Featured</span>
            </div>

            {/* Live / coming soon */}
            {!isLive(token) && (
              <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md bg-white/10 backdrop-blur-sm">
                <span className="text-[9px] font-bold text-white/50 uppercase tracking-wider">Soon</span>
              </div>
            )}

            {/* Bottom info */}
            <div className="absolute bottom-0 left-0 right-0 p-2.5">
              <div className="text-[13px] font-black text-white leading-tight">{token.marketCap}</div>
              <div className="text-[12px] font-bold text-white/80">{token.name} <span className="text-white/40 font-normal">{token.ticker}</span></div>
            </div>
          </a>
        ))}

        {/* Placeholder cards */}
        {Array.from({ length: Math.max(0, 4 - featured.length) }).map((_, i) => (
          <div
            key={i}
            className="flex-shrink-0 w-[200px] h-[155px] rounded-xl border border-dashed border-white/[0.08] bg-white/[0.02] flex items-center justify-center"
          >
            <span className="text-[12px] text-white/15 font-medium">Coming Soon</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TokenCard({ token }: { token: Token }) {
  const live = isLive(token);
  return (
    <a
      href={token.pumpfunUrl || "#"}
      target={token.pumpfunUrl ? "_blank" : undefined}
      rel="noopener noreferrer"
      className="flex gap-3 p-3 rounded-xl border border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.05] hover:border-[#38BDF8]/25 transition-all duration-150 group"
    >
      {/* Token image */}
      <div className="relative flex-shrink-0 w-[72px] h-[72px] rounded-xl overflow-hidden border border-white/10">
        <img
          src={token.imageUrl}
          alt={token.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
        {!live && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <span className="text-[9px] font-bold text-white/60 uppercase">Soon</span>
          </div>
        )}
      </div>

      {/* Token info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <div>
            <span className="text-[14px] font-bold text-white">{token.name}</span>
            <span className="text-[12px] text-white/40 ml-1.5">{token.ticker}</span>
          </div>
          {token.featured && (
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[#FACC15]/10 border border-[#FACC15]/20 flex-shrink-0">
              <Zap className="h-2.5 w-2.5 text-[#FACC15]" />
              <span className="text-[9px] font-bold text-[#FACC15] uppercase">Featured</span>
            </div>
          )}
        </div>

        {/* Creator + time */}
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="text-[11px] text-[#38BDF8]/70 font-medium">{token.creatorShort}</span>
          <span className="text-white/20 text-[10px]">·</span>
          <span className="text-[11px] text-white/30">{token.timeAgo}</span>
        </div>

        {/* Market cap + change */}
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[11px] text-white/40">MC:</span>
          <span className="text-[12px] font-bold text-white">{token.marketCap}</span>
          <span className={`text-[11px] font-bold ${token.changePositive ? "text-emerald-400" : "text-red-400"}`}>
            {token.change}
          </span>
        </div>

        {/* Description */}
        <p className="text-[11px] text-white/35 leading-relaxed line-clamp-2">{token.description}</p>

        {/* CA copy */}
        {live && (
          <div className="mt-2">
            <CopyCA address={token.contractAddress} />
          </div>
        )}
      </div>

      {/* Buy arrow */}
      {token.pumpfunUrl && (
        <div className="flex-shrink-0 self-center opacity-0 group-hover:opacity-100 transition-opacity">
          <ExternalLink className="h-4 w-4 text-[#38BDF8]/50" />
        </div>
      )}
    </a>
  );
}

export default function DiscoverPage() {
  const [activeTab, setActiveTab] = useState<Tab>("featured");

  const filtered = TOKENS.filter((t) => {
    if (activeTab === "featured") return t.tag === "featured" || t.featured;
    return t.tag === activeTab;
  });

  return (
    <HodlrLayout>
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-7">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">Discover</h1>
          <p className="text-sm text-white/40 mt-1">Tokens launching through the HODLR platform.</p>
        </div>

        {/* Featured horizontal strip */}
        <FeaturedStrip tokens={TOKENS} />

        {/* Tab row */}
        <div className="flex items-center gap-1 border-b border-white/[0.06] pb-0">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-bold rounded-t-lg transition-all duration-150 -mb-px border-b-2 ${
                activeTab === id
                  ? "text-[#38BDF8] border-[#38BDF8] bg-[#38BDF8]/[0.06]"
                  : "text-white/35 border-transparent hover:text-white/60 hover:bg-white/[0.03]"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Token grid */}
        {filtered.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            {filtered.map((token) => (
              <TokenCard key={token.ticker} token={token} />
            ))}
          </div>
        ) : (
          <div className="py-16 text-center">
            <div className="text-white/20 text-sm font-medium">No tokens in this category yet.</div>
          </div>
        )}

      </div>
    </HodlrLayout>
  );
}

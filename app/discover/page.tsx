"use client";

import { useState } from "react";
import { ExternalLink, Copy, Check, TrendingUp, Users, Zap, Shield, Twitter, Globe } from "lucide-react";
import { HodlrLayout } from "@/app/components/hodlr";

// ── FLAGSHIP TOKEN CONFIG ─────────────────────────────────────────────────────
// Replace these values when the token is live on pump.fun
const FLAGSHIP: {
  name: string;
  ticker: string;
  contractAddress: string;
  description: string;
  logoUrl: string;
  pumpfunUrl: string;
  twitterUrl: string;
  websiteUrl: string;
  tags: string[];
  stats: { label: string; value: string; sub?: string }[];
} = {
  name: "HODLR",
  ticker: "HODLR",
  contractAddress: process.env.NEXT_PUBLIC_TOKEN_CONTRACT_ADDRESS ?? "",
  description:
    "The on-chain loyalty token rewarding diamond hands. Hold longer, earn more. Every epoch, the top holders by duration and balance share a SOL reward pool - automatically, trustlessly, on Solana.",
  logoUrl: "/pfp.jpg",
  pumpfunUrl: "",
  twitterUrl: "",
  websiteUrl: "https://hodlr.fun",
  tags: ["Solana", "Hold-to-Earn", "Rewards", "pump.fun"],
  stats: [
    { label: "Network", value: "Solana", sub: "mainnet-beta" },
    { label: "Platform", value: "pump.fun", sub: "bonding curve" },
    { label: "Reward Model", value: "Hold-to-Earn", sub: "epoch-based" },
    { label: "Distribution", value: "SOL Rewards", sub: "top holders" },
  ],
};
// ─────────────────────────────────────────────────────────────────────────────

const isLive =
  FLAGSHIP.contractAddress &&
  FLAGSHIP.contractAddress !== "coming soon" &&
  FLAGSHIP.contractAddress !== "";

function CopyCA({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  const short = `${address.slice(0, 6)}...${address.slice(-6)}`;

  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(address).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#38BDF8]/10 border border-[#38BDF8]/25 hover:bg-[#38BDF8]/20 hover:border-[#38BDF8]/50 transition-all duration-150 active:scale-95 group"
    >
      <span className="font-mono text-[13px] text-[#38BDF8] font-medium">{copied ? "Copied!" : short}</span>
      {copied
        ? <Check className="h-3.5 w-3.5 text-[#38BDF8]" />
        : <Copy className="h-3.5 w-3.5 text-[#38BDF8]/50 group-hover:text-[#38BDF8] transition-colors" />
      }
    </button>
  );
}

export default function DiscoverPage() {
  return (
    <HodlrLayout>
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">Discover</h1>
          <p className="text-sm text-white/40 mt-1">Featured tokens launching through the HODLR platform.</p>
        </div>

        {/* Flagship Token Card */}
        <div className="relative rounded-2xl border border-[#38BDF8]/20 bg-[#0D0E10] overflow-hidden">

          {/* Top glow bar */}
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#38BDF8]/60 to-transparent" />

          {/* Background ambient glow */}
          <div className="absolute top-0 right-0 w-[400px] h-[400px] rounded-full bg-[#38BDF8]/[0.03] blur-3xl pointer-events-none" />

          <div className="relative p-6 sm:p-8">

            {/* Featured badge */}
            <div className="flex items-center gap-2 mb-6">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#FACC15]/10 border border-[#FACC15]/25">
                <Zap className="h-3 w-3 text-[#FACC15]" />
                <span className="text-[11px] font-bold tracking-wider uppercase text-[#FACC15]">Flagship Launch</span>
              </div>
              {isLive && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[11px] font-bold tracking-wider uppercase text-emerald-400">Live</span>
                </div>
              )}
              {!isLive && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10">
                  <span className="w-1.5 h-1.5 rounded-full bg-white/30" />
                  <span className="text-[11px] font-bold tracking-wider uppercase text-white/30">Coming Soon</span>
                </div>
              )}
            </div>

            {/* Token identity */}
            <div className="flex items-start gap-5 mb-6">
              <div className="relative flex-shrink-0">
                <img
                  src={FLAGSHIP.logoUrl}
                  alt={FLAGSHIP.name}
                  className="w-16 h-16 rounded-2xl object-cover border border-white/10"
                />
                <div className="absolute inset-0 rounded-2xl ring-1 ring-[#38BDF8]/30" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-3 flex-wrap">
                  <h2 className="text-2xl font-black text-white tracking-tight">{FLAGSHIP.name}</h2>
                  <span className="text-sm font-bold text-[#38BDF8] bg-[#38BDF8]/10 px-2 py-0.5 rounded-md">
                    ${FLAGSHIP.ticker}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {FLAGSHIP.tags.map((tag) => (
                    <span key={tag} className="text-[11px] font-medium text-white/40 bg-white/[0.05] px-2 py-0.5 rounded-md border border-white/[0.06]">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Description */}
            <p className="text-[15px] text-white/60 leading-relaxed mb-6 max-w-2xl">
              {FLAGSHIP.description}
            </p>

            {/* Contract address */}
            {isLive && (
              <div className="flex items-center gap-3 mb-6 flex-wrap">
                <span className="text-[11px] font-bold tracking-widest uppercase text-white/25">Contract</span>
                <CopyCA address={FLAGSHIP.contractAddress} />
              </div>
            )}

            {/* Stats grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              {FLAGSHIP.stats.map((s) => (
                <div key={s.label} className="px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                  <div className="text-[10px] font-bold tracking-widest uppercase text-white/25 mb-1">{s.label}</div>
                  <div className="text-[14px] font-bold text-white">{s.value}</div>
                  {s.sub && <div className="text-[11px] text-white/35 mt-0.5">{s.sub}</div>}
                </div>
              ))}
            </div>

            {/* How it works */}
            <div className="rounded-xl border border-[#38BDF8]/10 bg-[#38BDF8]/[0.04] p-5 mb-6">
              <h3 className="text-[11px] font-bold tracking-widest uppercase text-[#38BDF8]/60 mb-4">How It Works</h3>
              <div className="grid sm:grid-cols-3 gap-4">
                {[
                  { icon: Shield, title: "Buy and Hold", body: "Acquire HODLR tokens and hold them in your wallet. The longer you hold, the higher your score." },
                  { icon: TrendingUp, title: "Epoch Scoring", body: "Every epoch, holders are ranked by duration and balance. Top holders qualify for SOL rewards." },
                  { icon: Users, title: "Claim Rewards", body: "When an epoch closes, eligible holders claim their share of the SOL reward pool directly to their wallet." },
                ].map(({ icon: Icon, title, body }) => (
                  <div key={title} className="flex gap-3">
                    <div className="w-7 h-7 rounded-lg bg-[#38BDF8]/10 border border-[#38BDF8]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Icon className="h-3.5 w-3.5 text-[#38BDF8]" />
                    </div>
                    <div>
                      <div className="text-[13px] font-bold text-white mb-1">{title}</div>
                      <div className="text-[12px] text-white/45 leading-relaxed">{body}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* CTA buttons */}
            <div className="flex flex-wrap gap-3">
              {isLive && FLAGSHIP.pumpfunUrl && (
                <a
                  href={FLAGSHIP.pumpfunUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#FACC15] hover:bg-[#FDE047] text-black font-bold text-[14px] transition-all duration-150 active:scale-95 hover:shadow-[0_0_20px_rgba(250,204,21,0.3)]"
                >
                  Buy on pump.fun
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
              {!isLive && (
                <div className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/[0.05] border border-white/10 text-white/30 font-bold text-[14px] cursor-default">
                  Buy on pump.fun - Coming Soon
                </div>
              )}
              {FLAGSHIP.twitterUrl && (
                <a
                  href={FLAGSHIP.twitterUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.05] border border-white/10 hover:bg-white/[0.08] hover:border-white/20 text-white/70 font-medium text-[14px] transition-all duration-150 active:scale-95"
                >
                  <Twitter className="h-4 w-4" />
                  Twitter
                </a>
              )}
              {FLAGSHIP.websiteUrl && (
                <a
                  href={FLAGSHIP.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.05] border border-white/10 hover:bg-white/[0.08] hover:border-white/20 text-white/70 font-medium text-[14px] transition-all duration-150 active:scale-95"
                >
                  <Globe className="h-4 w-4" />
                  Website
                </a>
              )}
            </div>

          </div>
        </div>

        {/* More tokens placeholder */}
        <div className="rounded-2xl border border-dashed border-white/[0.08] p-8 text-center">
          <div className="text-white/20 text-sm font-medium">More token launches coming soon</div>
        </div>

      </div>
    </HodlrLayout>
  );
}

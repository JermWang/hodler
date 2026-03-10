"use client";

import { useState, useEffect, useCallback } from "react";

const LS_KEY = "hodlr_intro_seen_v1";

// ── Animated SVG: Brilliant-cut gem (flat table top = clearly not ETH) ───────
function DiamondSVG() {
  return (
    <svg viewBox="0 0 220 200" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="dg_table" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#E0F5FF" />
          <stop offset="100%" stopColor="#7DD3FC" />
        </linearGradient>
        <linearGradient id="dg_cl" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.55)" />
          <stop offset="100%" stopColor="rgba(56,189,248,0.3)" />
        </linearGradient>
        <linearGradient id="dg_cr" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="rgba(56,189,248,0.4)" />
          <stop offset="100%" stopColor="rgba(125,211,252,0.7)" />
        </linearGradient>
        <linearGradient id="dg_pl" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="rgba(56,189,248,0.6)" />
          <stop offset="100%" stopColor="rgba(2,132,199,0.35)" />
        </linearGradient>
        <linearGradient id="dg_pr" x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="rgba(186,232,255,0.7)" />
          <stop offset="100%" stopColor="rgba(56,189,248,0.85)" />
        </linearGradient>
        <filter id="gemGlow">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <style>{`
          @keyframes floatGem {
            0%,100% { transform: translateY(0px); }
            50%      { transform: translateY(-9px); }
          }
          @keyframes sparkleIn {
            0%,100% { opacity:0; transform:scale(0) rotate(0deg); }
            40%,60% { opacity:1; transform:scale(1) rotate(45deg); }
          }
          @keyframes rotateRing {
            from { transform: rotate(0deg); }
            to   { transform: rotate(360deg); }
          }
          @keyframes glowPulse {
            0%,100% { opacity:0.25; }
            50%      { opacity:0.65; }
          }
          @keyframes shimmer {
            0%,100% { opacity:0.15; }
            50%      { opacity:0.55; }
          }
          .d-float  { animation: floatGem   3.2s ease-in-out infinite; transform-box:fill-box; transform-origin:50% 50%; }
          .sp1 { animation: sparkleIn 2.4s ease-in-out infinite 0s;   transform-box:fill-box; transform-origin:50% 50%; }
          .sp2 { animation: sparkleIn 2.4s ease-in-out infinite 0.6s; transform-box:fill-box; transform-origin:50% 50%; }
          .sp3 { animation: sparkleIn 2.4s ease-in-out infinite 1.2s; transform-box:fill-box; transform-origin:50% 50%; }
          .sp4 { animation: sparkleIn 2.4s ease-in-out infinite 1.8s; transform-box:fill-box; transform-origin:50% 50%; }
          .ring-orbit { animation: rotateRing 8s linear infinite; transform-box:fill-box; transform-origin:50% 50%; }
          .d-glow    { animation: glowPulse  3.2s ease-in-out infinite; }
          .d-shimmer { animation: shimmer    2.1s ease-in-out infinite; }
        `}</style>
      </defs>

      {/* Shadow glow below gem */}
      <ellipse cx="110" cy="178" rx="48" ry="7" fill="#38BDF8" opacity="0.2" className="d-glow" />

      {/* Orbiting ring */}
      <g className="ring-orbit" style={{ transformOrigin: "110px 103px" }}>
        <ellipse cx="110" cy="103" rx="74" ry="20" fill="none" stroke="#FACC15" strokeWidth="1" strokeDasharray="5 4" opacity="0.32" />
      </g>

      {/* ── Gem body (brilliant cut, flat table top) ── */}
      <g className="d-float" style={{ transformOrigin: "110px 103px" }}>

        {/* TABLE — flat octagonal face at top. This is what makes it NOT look like ETH */}
        <polygon
          points="84,40 136,40 150,54 150,66 136,76 84,76 70,66 70,54"
          fill="url(#dg_table)" filter="url(#gemGlow)" opacity="0.95"
        />
        {/* Table inner highlight */}
        <polygon
          points="92,48 128,48 138,58 138,64 128,70 92,70 82,64 82,58"
          fill="rgba(255,255,255,0.22)"
        />

        {/* CROWN — trapezoid facets widening from table to girdle (y=103) */}
        {/* Far-left wing */}
        <polygon points="42,103 70,54 70,66 52,103"  fill="url(#dg_cl)" />
        {/* Left crown */}
        <polygon points="52,103 70,66 84,76 68,103"  fill="rgba(255,255,255,0.28)" />
        {/* Left-center crown */}
        <polygon points="68,103 84,76 110,90 80,103" fill="rgba(255,255,255,0.15)" />
        {/* Center-top crown */}
        <polygon points="70,54 84,40 110,55 110,90 84,76" fill="rgba(255,255,255,0.18)" />
        <polygon points="150,54 136,40 110,55 110,90 136,76" fill="rgba(56,189,248,0.22)" />
        {/* Right-center crown */}
        <polygon points="140,103 136,76 110,90 150,103" fill="rgba(56,189,248,0.3)" />
        {/* Right crown */}
        <polygon points="158,103 150,66 136,76 152,103" fill="url(#dg_cr)" />
        {/* Far-right wing */}
        <polygon points="178,103 150,54 150,66 168,103" fill="rgba(125,211,252,0.5)" />

        {/* GIRDLE line */}
        <line x1="42" y1="103" x2="178" y2="103" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" />

        {/* PAVILION — narrows to culet point at bottom */}
        {/* Far-left pavilion */}
        <polygon points="42,103  68,103  110,170" fill="url(#dg_pl)" />
        {/* Left pavilion */}
        <polygon points="68,103  110,120 110,170" fill="rgba(255,255,255,0.12)" />
        {/* Center pavilion */}
        <polygon points="68,103  152,103 110,120" fill="rgba(56,189,248,0.14)" />
        {/* Right pavilion */}
        <polygon points="152,103 110,120 110,170" fill="rgba(56,189,248,0.45)" />
        {/* Far-right pavilion */}
        <polygon points="178,103 152,103 110,170" fill="url(#dg_pr)" />

        {/* Facet lines */}
        <line x1="68"  y1="103" x2="110" y2="170" stroke="rgba(255,255,255,0.18)" strokeWidth="0.8" />
        <line x1="152" y1="103" x2="110" y2="170" stroke="rgba(255,255,255,0.18)" strokeWidth="0.8" />
        <line x1="42"  y1="103" x2="110" y2="170" stroke="rgba(56,189,248,0.2)"   strokeWidth="0.6" />
        <line x1="178" y1="103" x2="110" y2="170" stroke="rgba(56,189,248,0.2)"   strokeWidth="0.6" />
        <line x1="110" y1="90"  x2="110" y2="170" stroke="rgba(255,255,255,0.1)"  strokeWidth="0.8" />

        {/* Outer silhouette */}
        <polygon
          points="42,103 70,54 84,40 136,40 150,54 178,103 110,170"
          fill="none" stroke="#38BDF8" strokeWidth="1.1" opacity="0.7"
        />

        {/* Shimmer streak on table */}
        <polygon points="86,44 110,44 120,62 96,62" fill="rgba(255,255,255,0.4)" className="d-shimmer" />

        {/* Gold bail / ring at the very top */}
        <ellipse cx="110" cy="39" rx="10" ry="5.5" fill="#FACC15" />
        <ellipse cx="110" cy="39" rx="6.5" ry="3"   fill="#b8930a" opacity="0.55" />
      </g>

      {/* Sparkles */}
      <g className="sp1" style={{ transformOrigin: "44px 68px" }}>
        <line x1="38" y1="68" x2="50" y2="68" stroke="white"   strokeWidth="1.8" strokeLinecap="round" />
        <line x1="44" y1="62" x2="44" y2="74" stroke="white"   strokeWidth="1.8" strokeLinecap="round" />
      </g>
      <g className="sp2" style={{ transformOrigin: "176px 90px" }}>
        <line x1="170" y1="90" x2="182" y2="90" stroke="#38BDF8" strokeWidth="1.8" strokeLinecap="round" />
        <line x1="176" y1="84" x2="176" y2="96" stroke="#38BDF8" strokeWidth="1.8" strokeLinecap="round" />
      </g>
      <g className="sp3" style={{ transformOrigin: "152px 46px" }}>
        <line x1="147" y1="46" x2="157" y2="46" stroke="white"   strokeWidth="1.5" strokeLinecap="round" />
        <line x1="152" y1="41" x2="152" y2="51" stroke="white"   strokeWidth="1.5" strokeLinecap="round" />
      </g>
      <g className="sp4" style={{ transformOrigin: "58px 142px" }}>
        <line x1="52"  y1="142" x2="64" y2="142" stroke="#FACC15" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="58"  y1="136" x2="58" y2="148" stroke="#FACC15" strokeWidth="1.5" strokeLinecap="round" />
      </g>
    </svg>
  );
}

// ── Animated SVG: Duration bar chart (HODLR vs Paper Hands) ─────────────────
function DurationSVG() {
  return (
    <svg viewBox="0 0 280 190" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="hodlGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#38BDF8" />
          <stop offset="100%" stopColor="#0284C7" />
        </linearGradient>
        <linearGradient id="paperGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.3)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0.08)" />
        </linearGradient>
        <style>{`
          @keyframes growHodl {
            0%  { transform: scaleY(0); }
            80% { transform: scaleY(1); }
            100%{ transform: scaleY(1); }
          }
          @keyframes growPaper {
            0%  { transform: scaleY(0); }
            50% { transform: scaleY(0.32); }
            100%{ transform: scaleY(0.32); }
          }
          @keyframes countUp {
            0%  { opacity:0; }
            70% { opacity:0; }
            100%{ opacity:1; }
          }
          @keyframes tickPulse {
            0%,100%{ r:3; opacity:0.5; }
            50%    { r:5; opacity:1; }
          }
          .hodl-bar  { transform-box:fill-box; transform-origin:50% 100%; animation: growHodl  2.8s cubic-bezier(.4,0,.2,1) infinite alternate; }
          .paper-bar { transform-box:fill-box; transform-origin:50% 100%; animation: growPaper 2.8s cubic-bezier(.4,0,.2,1) infinite alternate; }
          .count-lbl { animation: countUp 2.8s ease infinite alternate; }
          .tick1 { animation: tickPulse 1.6s ease-in-out infinite 0s; }
          .tick2 { animation: tickPulse 1.6s ease-in-out infinite 0.4s; }
          .tick3 { animation: tickPulse 1.6s ease-in-out infinite 0.8s; }
          .tick4 { animation: tickPulse 1.6s ease-in-out infinite 1.2s; }
        `}</style>
      </defs>

      {/* Grid lines */}
      {[130, 100, 70, 40].map((y, i) => (
        <line key={i} x1="52" y1={y} x2="235" y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
      ))}

      {/* Axes */}
      <line x1="52" y1="25" x2="52"  y2="145" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
      <line x1="52" y1="145" x2="235" y2="145" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />

      {/* HODLR bar */}
      <rect x="80"  y="40"  width="52" height="105" rx="5" fill="url(#hodlGrad)"  className="hodl-bar" />
      {/* Paper bar */}
      <rect x="165" y="111" width="52" height="34"  rx="5" fill="url(#paperGrad)" className="paper-bar" />

      {/* Bar labels */}
      <text x="106" y="162" textAnchor="middle" fill="#38BDF8"              fontSize="10" fontWeight="700">HODLR</text>
      <text x="191" y="162" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="10">Paper</text>

      {/* Multiplier badge */}
      <g className="count-lbl">
        <rect x="72" y="22" width="68" height="20" rx="6" fill="#FACC15" />
        <text x="106" y="35" textAnchor="middle" fill="#000" fontSize="11" fontWeight="800">3.2x Rewards</text>
      </g>

      {/* Timeline dots along x-axis */}
      <circle cx="80"  cy="152" r="3" fill="#38BDF8" className="tick1" />
      <circle cx="120" cy="152" r="3" fill="#38BDF8" className="tick2" />
      <circle cx="160" cy="152" r="3" fill="#38BDF8" className="tick3" />
      <circle cx="200" cy="152" r="3" fill="#38BDF8" className="tick4" />
      <text x="143" y="175" textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize="9">Holding Duration</text>

      {/* Y-axis labels */}
      <text x="46" y="148" textAnchor="end" fill="rgba(255,255,255,0.25)" fontSize="8">0</text>
      <text x="46" y="43"  textAnchor="end" fill="rgba(255,255,255,0.25)" fontSize="8">max</text>

      {/* Clock icon */}
      <circle cx="248" cy="52" r="16" fill="none" stroke="#38BDF8" strokeWidth="1.5" opacity="0.6" />
      <line x1="248" y1="40" x2="248" y2="52" stroke="#38BDF8" strokeWidth="1.8" strokeLinecap="round" opacity="0.6" />
      <line x1="248" y1="52" x2="257" y2="52" stroke="#38BDF8" strokeWidth="1.8" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}

// ── Animated SVG: SOL coins raining into wallet ──────────────────────────────
function RewardSVG() {
  return (
    <svg viewBox="0 0 220 200" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="walletGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="rgba(56,189,248,0.25)" />
          <stop offset="100%" stopColor="rgba(56,189,248,0.08)" />
        </linearGradient>
        <style>{`
          @keyframes drop1 {
            0%   { transform:translateY(-45px); opacity:0; }
            15%  { opacity:1; }
            65%  { transform:translateY(90px); opacity:1; }
            80%  { transform:translateY(90px); opacity:0; }
            100% { transform:translateY(-45px); opacity:0; }
          }
          @keyframes drop2 {
            0%   { transform:translateY(-45px); opacity:0; }
            15%  { opacity:1; }
            65%  { transform:translateY(90px); opacity:1; }
            80%  { transform:translateY(90px); opacity:0; }
            100% { transform:translateY(-45px); opacity:0; }
          }
          @keyframes drop3 {
            0%   { transform:translateY(-45px); opacity:0; }
            15%  { opacity:1; }
            65%  { transform:translateY(90px); opacity:1; }
            80%  { transform:translateY(90px); opacity:0; }
            100% { transform:translateY(-45px); opacity:0; }
          }
          @keyframes walletPulse {
            0%,100%{ box-shadow:none; }
            50%    { opacity:1; }
          }
          @keyframes glowRing {
            0%,100%{ opacity:0.2; transform:scale(1);   }
            50%    { opacity:0.6; transform:scale(1.08); }
          }
          @keyframes stackGrow {
            0%  { transform:scaleX(0); }
            100%{ transform:scaleX(1); }
          }
          .c1 { animation: drop1 2.2s ease-in-out infinite 0s;   transform-box:fill-box; transform-origin:50% 0%; }
          .c2 { animation: drop2 2.2s ease-in-out infinite 0.55s; transform-box:fill-box; transform-origin:50% 0%; }
          .c3 { animation: drop3 2.2s ease-in-out infinite 1.1s;  transform-box:fill-box; transform-origin:50% 0%; }
          .glow-ring { animation: glowRing 2.2s ease-in-out infinite; transform-box:fill-box; transform-origin:50% 50%; }
          .stack-bar { animation: stackGrow 3s ease-out infinite alternate; transform-box:fill-box; transform-origin:0% 50%; }
        `}</style>
      </defs>

      {/* Wallet body */}
      <rect x="45" y="130" width="130" height="52" rx="10" fill="url(#walletGrad)" stroke="#38BDF8" strokeWidth="1.4" />
      <rect x="55" y="140" width="110" height="6"  rx="3" fill="rgba(56,189,248,0.25)" />
      <text x="110" y="168" textAnchor="middle" fill="#38BDF8" fontSize="11" fontWeight="700" letterSpacing="1">WALLET</text>

      {/* Glow ring around wallet opening */}
      <ellipse cx="110" cy="133" rx="52" ry="7" fill="#FACC15" opacity="0.12" className="glow-ring" />

      {/* Stacked coin progress bar inside wallet */}
      <rect x="58" y="154" width="104" height="4" rx="2" fill="rgba(255,255,255,0.08)" />
      <rect x="58" y="154" width="72"  height="4" rx="2" fill="#FACC15" opacity="0.7" className="stack-bar" />

      {/* Falling coins */}
      <g className="c1">
        <circle cx="75"  cy="72" r="14" fill="#FACC15" />
        <circle cx="75"  cy="72" r="10" fill="#FDE047" opacity="0.6" />
        <text x="75"  y="77" textAnchor="middle" fill="#78350F" fontSize="12" fontWeight="900">◎</text>
      </g>
      <g className="c2">
        <circle cx="110" cy="72" r="14" fill="#FACC15" />
        <circle cx="110" cy="72" r="10" fill="#FDE047" opacity="0.6" />
        <text x="110" y="77" textAnchor="middle" fill="#78350F" fontSize="12" fontWeight="900">◎</text>
      </g>
      <g className="c3">
        <circle cx="145" cy="72" r="14" fill="#FACC15" />
        <circle cx="145" cy="72" r="10" fill="#FDE047" opacity="0.6" />
        <text x="145" y="77" textAnchor="middle" fill="#78350F" fontSize="12" fontWeight="900">◎</text>
      </g>

      {/* "SOL Rewards" label at top */}
      <text x="110" y="22" textAnchor="middle" fill="rgba(250,204,21,0.9)" fontSize="13" fontWeight="800" letterSpacing="0.5">SOL REWARDS</text>
      <line x1="65" y1="27" x2="155" y2="27" stroke="rgba(250,204,21,0.3)" strokeWidth="1" />
    </svg>
  );
}

// ── Slides data ───────────────────────────────────────────────────────────────
const SLIDES = [
  {
    svg: <DiamondSVG />,
    tag: "Welcome",
    title: "Diamond Hands Pay Off",
    body: "HODLR rewards wallets that stay committed. Your unbroken holding streak is your score - and the longer you hold, the more you earn.",
  },
  {
    svg: <DurationSVG />,
    tag: "How It Works",
    title: "Duration is Your Edge",
    body: "Every epoch, rewards are distributed based on holding duration weighted against bag size. Weak hands get less. Diamond hands get more - every single time.",
  },
  {
    svg: <RewardSVG />,
    tag: "Claim",
    title: "Claim Real SOL Every Epoch",
    body: "Top holders claim a share of SOL distributions each week. Connect your wallet, hold through the epoch, and claim your cut directly to your wallet.",
  },
];

// ── IntroModal ────────────────────────────────────────────────────────────────
export function IntroModal() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [animDir, setAnimDir] = useState<"in" | "out">("in");

  useEffect(() => {
    try {
      if (!localStorage.getItem(LS_KEY)) setOpen(true);
    } catch {}
  }, []);

  const dismiss = useCallback(() => {
    try { localStorage.setItem(LS_KEY, "1"); } catch {}
    setOpen(false);
  }, []);

  const go = useCallback((dir: 1 | -1) => {
    setAnimDir("out");
    setTimeout(() => {
      setStep((s) => Math.max(0, Math.min(SLIDES.length - 1, s + dir)));
      setAnimDir("in");
    }, 160);
  }, []);

  if (!open) return null;

  const slide = SLIDES[step];
  const isLast = step === SLIDES.length - 1;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: "rgba(8,8,9,0.82)", backdropFilter: "blur(10px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) dismiss(); }}
    >
      <div
        className="relative w-full max-w-[480px] rounded-2xl border border-white/10 overflow-hidden"
        style={{
          background: "linear-gradient(160deg, rgba(20,24,32,0.98) 0%, rgba(12,14,18,0.98) 100%)",
          boxShadow: "0 0 80px rgba(56,189,248,0.08), 0 0 2px rgba(56,189,248,0.2)",
        }}
      >
        {/* Top accent bar */}
        <div className="h-[2px] w-full" style={{ background: "linear-gradient(90deg, #38BDF8, #FACC15, #38BDF8)" }} />

        {/* Skip button */}
        <button
          onClick={dismiss}
          className="absolute top-4 right-4 text-white/30 hover:text-white/60 transition-colors text-sm"
        >
          Skip
        </button>

        {/* SVG illustration */}
        <div
          className="w-full px-8 pt-8 pb-2"
          style={{
            height: 200,
            transition: "opacity 0.16s ease, transform 0.16s ease",
            opacity: animDir === "in" ? 1 : 0,
            transform: animDir === "in" ? "translateY(0)" : "translateY(6px)",
          }}
        >
          {slide.svg}
        </div>

        {/* Text content */}
        <div
          className="px-8 pb-2"
          style={{
            transition: "opacity 0.16s ease",
            opacity: animDir === "in" ? 1 : 0,
          }}
        >
          <div
            className="inline-block text-[10px] font-bold tracking-widest uppercase px-2.5 py-1 rounded-full mb-3"
            style={{ background: "rgba(56,189,248,0.12)", color: "#38BDF8", border: "1px solid rgba(56,189,248,0.2)" }}
          >
            {slide.tag}
          </div>
          <h2 className="text-white text-xl font-black tracking-tight leading-snug mb-3">
            {slide.title}
          </h2>
          <p className="text-white/55 text-sm leading-relaxed">
            {slide.body}
          </p>
        </div>

        {/* Footer: dots + buttons */}
        <div className="px-8 py-6 flex items-center justify-between">
          {/* Step dots */}
          <div className="flex items-center gap-2">
            {SLIDES.map((_, i) => (
              <button
                key={i}
                onClick={() => {
                  setAnimDir("out");
                  setTimeout(() => { setStep(i); setAnimDir("in"); }, 160);
                }}
                className="rounded-full transition-all"
                style={{
                  width: i === step ? 20 : 6,
                  height: 6,
                  background: i === step ? "#38BDF8" : "rgba(255,255,255,0.18)",
                }}
              />
            ))}
          </div>

          {/* Nav buttons */}
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                onClick={() => go(-1)}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white/50 hover:text-white/80 transition-colors"
              >
                Back
              </button>
            )}
            <button
              onClick={isLast ? dismiss : () => go(1)}
              className="px-5 py-2 rounded-lg text-sm font-bold text-black transition-all hover:scale-105 active:scale-95"
              style={{ background: "#FACC15" }}
            >
              {isLast ? "Get Started" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

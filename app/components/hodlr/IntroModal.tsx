"use client";

import { useState, useEffect, useCallback } from "react";

const LS_KEY = "hodlr_intro_seen_v1";

// ── Animated SVG: Diamond floating with sparkles ─────────────────────────────
function DiamondSVG() {
  return (
    <svg viewBox="0 0 220 200" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="dg1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#BAE8FF" />
          <stop offset="45%" stopColor="#38BDF8" />
          <stop offset="100%" stopColor="#0369A1" />
        </linearGradient>
        <linearGradient id="dg2" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.55)" />
          <stop offset="100%" stopColor="rgba(56,189,248,0.15)" />
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <style>{`
          @keyframes floatDiamond {
            0%,100% { transform: translateY(0px); }
            50%      { transform: translateY(-10px); }
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
            0%,100% { opacity:0.3; }
            50%      { opacity:0.7; }
          }
          .d-float { animation: floatDiamond 3.2s ease-in-out infinite; transform-box: fill-box; transform-origin: 50% 50%; }
          .sp1 { animation: sparkleIn 2.4s ease-in-out infinite 0s;    transform-box:fill-box; transform-origin:50% 50%; }
          .sp2 { animation: sparkleIn 2.4s ease-in-out infinite 0.6s;  transform-box:fill-box; transform-origin:50% 50%; }
          .sp3 { animation: sparkleIn 2.4s ease-in-out infinite 1.2s;  transform-box:fill-box; transform-origin:50% 50%; }
          .sp4 { animation: sparkleIn 2.4s ease-in-out infinite 1.8s;  transform-box:fill-box; transform-origin:50% 50%; }
          .ring-orbit { animation: rotateRing 8s linear infinite; transform-box:fill-box; transform-origin:50% 50%; }
          .d-glow { animation: glowPulse 3.2s ease-in-out infinite; }
        `}</style>
      </defs>

      {/* Ambient glow under diamond */}
      <ellipse cx="110" cy="175" rx="50" ry="8" fill="#38BDF8" opacity="0.18" className="d-glow" />

      {/* Orbiting ring */}
      <g className="ring-orbit" style={{ transformOrigin: "110px 100px" }}>
        <ellipse cx="110" cy="100" rx="72" ry="22" fill="none" stroke="#FACC15" strokeWidth="1" strokeDasharray="6 4" opacity="0.35" />
      </g>

      {/* Diamond body */}
      <g className="d-float" style={{ transformOrigin: "110px 100px" }}>
        {/* Top crown facets */}
        <polygon points="110,32 148,80 110,95 72,80" fill="url(#dg2)" filter="url(#glow)" />
        {/* Left face */}
        <polygon points="72,80 110,95 110,168" fill="rgba(56,189,248,0.55)" />
        {/* Right face */}
        <polygon points="148,80 110,95 110,168" fill="rgba(56,189,248,0.8)" />
        {/* Top-left facet */}
        <polygon points="110,32 72,80 88,62"  fill="rgba(255,255,255,0.35)" />
        {/* Top-right facet */}
        <polygon points="110,32 148,80 132,62" fill="rgba(255,255,255,0.22)" />
        {/* Belt */}
        <polyline points="72,80 88,62 110,70 132,62 148,80" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.8" />
        {/* Outline */}
        <polygon points="110,32 148,80 110,168 72,80" fill="none" stroke="#38BDF8" strokeWidth="1.2" opacity="0.8" />
        {/* Inner highlight */}
        <line x1="110" y1="32" x2="110" y2="95" stroke="rgba(255,255,255,0.3)" strokeWidth="0.8" />

        {/* Gold ring on top */}
        <ellipse cx="110" cy="31" rx="11" ry="6" fill="#FACC15" />
        <ellipse cx="110" cy="31" rx="7"  ry="3.5" fill="#b8930a" opacity="0.6" />
      </g>

      {/* Sparkles */}
      <g className="sp1" style={{ transformOrigin: "46px 62px" }}>
        <line x1="40" y1="62" x2="52" y2="62" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        <line x1="46" y1="56" x2="46" y2="68" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      </g>
      <g className="sp2" style={{ transformOrigin: "170px 88px" }}>
        <line x1="164" y1="88" x2="176" y2="88" stroke="#38BDF8" strokeWidth="1.8" strokeLinecap="round" />
        <line x1="170" y1="82" x2="170" y2="94" stroke="#38BDF8" strokeWidth="1.8" strokeLinecap="round" />
      </g>
      <g className="sp3" style={{ transformOrigin: "145px 44px" }}>
        <line x1="140" y1="44" x2="150" y2="44" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="145" y1="39" x2="145" y2="49" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
      </g>
      <g className="sp4" style={{ transformOrigin: "62px 138px" }}>
        <line x1="56" y1="138" x2="68" y2="138" stroke="#FACC15" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="62" y1="132" x2="62" y2="144" stroke="#FACC15" strokeWidth="1.5" strokeLinecap="round" />
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

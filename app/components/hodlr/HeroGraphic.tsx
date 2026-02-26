"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/app/lib/utils";

interface HeroGraphicProps {
  className?: string;
}

export function HeroGraphic({ className }: HeroGraphicProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const t = setTimeout(() => {
      el.classList.add("opacity-100");
      el.classList.remove("opacity-0", "translate-y-4");
    }, 100);
    return () => clearTimeout(t);
  }, []);

  // Triangle node positions
  const bx = 155, by = 155;   // Balance (top-left)
  const tx = 445, ty = 155;   // Time (top-right)
  const wx = 300, wy = 390;   // Weight (bottom-center)

  // Curved edge paths (soft triangle)
  const pathBT = `M ${bx + 30},${by - 20} Q 300,65 ${tx - 30},${ty - 20}`;
  const pathTW = `M ${tx + 10},${ty + 30} Q 440,290 ${wx + 40},${wy - 30}`;
  const pathWB = `M ${wx - 40},${wy - 30} Q 160,290 ${bx - 10},${by + 30}`;

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative w-full aspect-[2/1] max-w-3xl mx-auto opacity-0 translate-y-4 transition-all duration-1000 ease-out",
        className
      )}
    >
      <svg
        viewBox="0 0 600 520"
        className="w-full h-full"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Edge gradients */}
          <linearGradient id="g-bt" x1={bx} y1={by} x2={tx} y2={ty} gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.6" />
          </linearGradient>
          <linearGradient id="g-tw" x1={tx} y1={ty} x2={wx} y2={wy} gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#B6F04A" stopOpacity="0.9" />
          </linearGradient>
          <linearGradient id="g-wb" x1={wx} y1={wy} x2={bx} y2={by} gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#B6F04A" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.12" />
          </linearGradient>

          {/* Particle trail gradient (fades out behind particle) */}
          <radialGradient id="particle-glow">
            <stop offset="0%" stopColor="#B6F04A" stopOpacity="1" />
            <stop offset="100%" stopColor="#B6F04A" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="particle-amber">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="particle-white">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>

          {/* Glow filters */}
          <filter id="glow-lime" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="10" result="b1" />
            <feGaussianBlur stdDeviation="20" result="b2" />
            <feMerge>
              <feMergeNode in="b2" />
              <feMergeNode in="b1" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="glow-amber" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="6" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="text-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="1" stdDeviation="3" floodColor="#000000" floodOpacity="0.95" />
          </filter>

          {/* Motion paths */}
          <path id="mp-bt" d={pathBT} />
          <path id="mp-tw" d={pathTW} />
          <path id="mp-wb" d={pathWB} />
        </defs>

        {/* Ambient background glow behind weight node */}
        <circle cx={wx} cy={wy} r="120" fill="rgba(182,240,74,0.025)" />

        {/* Edge lines */}
        <g strokeWidth="2" strokeLinecap="round" opacity="0.9">
          <path d={pathBT} stroke="url(#g-bt)" />
          <path d={pathTW} stroke="url(#g-tw)" />
          <path d={pathWB} stroke="url(#g-wb)" strokeDasharray="6 8" opacity="0.45" />
        </g>

        {/* Animated particles */}
        <g>
          {/* Balance -> Time: white particle */}
          <circle r="12" fill="url(#particle-white)" opacity="0.7">
            <animateMotion dur="3s" repeatCount="indefinite"><mpath href="#mp-bt" /></animateMotion>
          </circle>
          <circle r="3" fill="#ffffff">
            <animateMotion dur="3s" repeatCount="indefinite"><mpath href="#mp-bt" /></animateMotion>
          </circle>

          {/* Time -> Weight: amber to lime particle */}
          <circle r="16" fill="url(#particle-glow)" opacity="0.5">
            <animateMotion dur="2.5s" repeatCount="indefinite"><mpath href="#mp-tw" /></animateMotion>
          </circle>
          <circle r="4" fill="#B6F04A">
            <animateMotion dur="2.5s" repeatCount="indefinite"><mpath href="#mp-tw" /></animateMotion>
          </circle>

          {/* Weight -> Balance: lime feedback particle */}
          <circle r="10" fill="url(#particle-glow)" opacity="0.3">
            <animateMotion dur="4s" repeatCount="indefinite"><mpath href="#mp-wb" /></animateMotion>
          </circle>
          <circle r="2.5" fill="#B6F04A" opacity="0.7">
            <animateMotion dur="4s" repeatCount="indefinite"><mpath href="#mp-wb" /></animateMotion>
          </circle>

          {/* Secondary staggered particles for density */}
          <circle r="2" fill="#ffffff" opacity="0.4">
            <animateMotion dur="3s" begin="1.5s" repeatCount="indefinite"><mpath href="#mp-bt" /></animateMotion>
          </circle>
          <circle r="3" fill="#B6F04A" opacity="0.4">
            <animateMotion dur="2.5s" begin="1.2s" repeatCount="indefinite"><mpath href="#mp-tw" /></animateMotion>
          </circle>
        </g>

        {/* NODE: Balance (top-left) */}
        <g transform={`translate(${bx}, ${by})`}>
          <circle r="48" fill="#0a0a0b" stroke="rgba(255,255,255,0.07)" strokeWidth="1.5" />
          <circle r="48" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="6" />

          {/* Stacked coins icon */}
          <ellipse cx="0" cy="-12" rx="16" ry="5.5" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" />
          <ellipse cx="0" cy="-4" rx="16" ry="5.5" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
          <ellipse cx="0" cy="4" rx="16" ry="5.5" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
          <path d="M -16,4 L -16,12 A 16 5.5 0 0 0 16,12 L 16,4" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />

          <text y="78" fill="#ffffff" fontSize="13" fontFamily="system-ui, sans-serif" textAnchor="middle" fontWeight="800" letterSpacing="2.5" filter="url(#text-shadow)" opacity="0.85">BALANCE</text>
        </g>

        {/* NODE: Time Held (top-right) */}
        <g transform={`translate(${tx}, ${ty})`}>
          <circle r="52" fill="#0a0a0b" stroke="rgba(245,158,11,0.12)" strokeWidth="1.5" />

          {/* Outer spinning ring */}
          <circle r="52" fill="none" stroke="#f59e0b" strokeWidth="2" strokeDasharray="10 20" opacity="0.25">
            <animateTransform attributeName="transform" type="rotate" from="0" to="-360" dur="20s" repeatCount="indefinite" />
          </circle>

          {/* Clock face */}
          <circle r="28" fill="rgba(245,158,11,0.06)" stroke="rgba(245,158,11,0.35)" strokeWidth="1.5" />

          {/* Hour ticks */}
          {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg) => (
            <line
              key={deg}
              x1="0" y1="-23" x2="0" y2="-26"
              stroke="rgba(245,158,11,0.3)" strokeWidth="1.5" strokeLinecap="round"
              transform={`rotate(${deg})`}
            />
          ))}

          {/* Clock hands */}
          <line x1="0" y1="2" x2="0" y2="-17" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" opacity="0.9">
            <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="12s" repeatCount="indefinite" />
          </line>
          <line x1="0" y1="2" x2="0" y2="-11" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" opacity="0.6">
            <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="60s" repeatCount="indefinite" />
          </line>
          <circle r="2.5" fill="#f59e0b" opacity="0.8" />

          <text y="82" fill="#f59e0b" fontSize="13" fontFamily="system-ui, sans-serif" textAnchor="middle" fontWeight="800" letterSpacing="2.5" filter="url(#text-shadow)" opacity="0.85">TIME HELD</text>
        </g>

        {/* NODE: Weight (bottom-center) */}
        <g transform={`translate(${wx}, ${wy})`}>
          {/* Outer glow rings */}
          <circle r="68" fill="none" stroke="#B6F04A" strokeWidth="1" strokeDasharray="4 8" opacity="0.15">
            <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="30s" repeatCount="indefinite" />
          </circle>
          <circle r="58" fill="none" stroke="#B6F04A" strokeWidth="1.5" strokeDasharray="3 6" opacity="0.2">
            <animateTransform attributeName="transform" type="rotate" from="0" to="-360" dur="22s" repeatCount="indefinite" />
          </circle>

          {/* Dark background */}
          <circle r="48" fill="#0a0a0b" />
          <circle r="48" fill="none" stroke="rgba(182,240,74,0.15)" strokeWidth="1.5" />

          {/* Core glow */}
          <circle r="30" fill="#B6F04A" filter="url(#glow-lime)">
            <animate attributeName="r" values="28;31;28" dur="3s" repeatCount="indefinite" />
          </circle>
          <circle r="30" fill="rgba(182,240,74,0.3)">
            <animate attributeName="r" values="30;36;30" dur="3s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.3;0.1;0.3" dur="3s" repeatCount="indefinite" />
          </circle>

          <text y="7" fill="#000000" fontSize="22" fontFamily="system-ui, sans-serif" textAnchor="middle" fontWeight="900" letterSpacing="1">W</text>

          <text y="82" fill="#B6F04A" fontSize="16" fontFamily="system-ui, sans-serif" textAnchor="middle" fontWeight="900" letterSpacing="3" filter="url(#text-shadow)">WEIGHT</text>
        </g>

        {/* Arrow hints on edges */}
        <g fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" opacity="0.3">
          <path d="M 296,74 l 6,-4 -1,6" stroke="#f59e0b" />
          <path d="M 428,295 l 2,6 -6,1" stroke="#B6F04A" />
          <path d="M 172,295 l -2,-6 -5,3" stroke="rgba(182,240,74,0.6)" />
        </g>
      </svg>
    </div>
  );
}

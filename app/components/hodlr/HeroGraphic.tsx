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
    
    // Quick entry animation 
    setTimeout(() => {
      el.classList.add("opacity-100");
      el.classList.remove("opacity-0", "translate-y-4");
    }, 100);
  }, []);

  return (
    <div 
      ref={containerRef}
      className={cn(
        "relative w-full aspect-[2/1] max-w-3xl mx-auto opacity-0 translate-y-4 transition-all duration-1000 ease-out", 
        className
      )}
    >
      {/* 
        Circular Loop Visualization:
        - Top Left: Balance (Gray/White)
        - Top Right: Time (Amber)
        - Bottom Center: Yield/Weight (Lime)
        Creates a continuous cycle of holding -> compounding -> yielding
      */}
      <svg 
        viewBox="0 0 600 500" 
        className="w-full h-full drop-shadow-[0_0_40px_rgba(182,240,74,0.12)]"
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Gradients for the circular loop */}
          <linearGradient id="arc-balance-time" x1="150" y1="150" x2="450" y2="150" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.8" />
          </linearGradient>
          
          <linearGradient id="arc-time-yield" x1="450" y1="150" x2="300" y2="380" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#B6F04A" stopOpacity="1" />
          </linearGradient>

          <linearGradient id="arc-yield-balance" x1="300" y1="380" x2="150" y2="150" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#B6F04A" stopOpacity="1" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.2" />
          </linearGradient>
          
          {/* Intense glow for the yield node */}
          <filter id="glow-lime-strong" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="12" result="blur1"/>
            <feGaussianBlur stdDeviation="24" result="blur2"/>
            <feMerge>
              <feMergeNode in="blur2"/>
              <feMergeNode in="blur1"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>

          {/* Subtle text shadow for better legibility */}
          <filter id="text-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#000000" floodOpacity="0.9"/>
          </filter>
        </defs>

        {/* Central Triangle/Loop Paths */}
        {/* We use three separate bezier curves to form a soft triangle */}
        <g strokeWidth="4" fill="none" strokeLinecap="round">
          {/* Balance -> Time (Top edge) */}
          <path d="M 180,130 Q 300,80 420,130" stroke="url(#arc-balance-time)" />
          
          {/* Time -> Yield (Right edge) */}
          <path d="M 460,180 Q 450,280 340,360" stroke="url(#arc-time-yield)" />
          
          {/* Yield -> Balance (Left edge) */}
          <path d="M 260,360 Q 150,280 140,180" stroke="url(#arc-yield-balance)" strokeDasharray="8 8" opacity="0.5" />
        </g>

        {/* Animated Particles following the loop */}
        <g>
          {/* Particle 1: Balance to Time */}
          <circle r="5" fill="#ffffff" filter="blur(1px)">
            <animateMotion path="M 180,130 Q 300,80 420,130" dur="2s" repeatCount="indefinite" />
          </circle>
          
          {/* Particle 2: Time to Yield (Fast, bright) */}
          <circle r="7" fill="#B6F04A" filter="url(#glow-lime-strong)">
            <animateMotion path="M 460,180 Q 450,280 340,360" dur="1.5s" repeatCount="indefinite" />
          </circle>

          {/* Particle 3: Yield feedback to Balance */}
          <circle r="4" fill="#B6F04A" opacity="0.6">
            <animateMotion path="M 260,360 Q 150,280 140,180" dur="3s" repeatCount="indefinite" />
          </circle>
        </g>


        {/* --- NODE 1: BALANCE (Top Left) --- */}
        <g transform="translate(150, 150)">
          <circle cx="0" cy="0" r="45" fill="#080809" stroke="rgba(255,255,255,0.1)" strokeWidth="2" />
          {/* Stacked coins aesthetic */}
          <ellipse cx="0" cy="-10" rx="18" ry="6" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" />
          <path d="M -18,-10 L -18,10 A 18 6 0 0 0 18,10 L 18,-10" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" />
          
          <text x="0" y="75" fill="#ffffff" fontSize="16" fontFamily="sans-serif" textAnchor="middle" fontWeight="900" letterSpacing="2" filter="url(#text-shadow)">BALANCE</text>
        </g>


        {/* --- NODE 2: TIME HELD (Top Right) --- */}
        <g transform="translate(450, 150)">
          <circle cx="0" cy="0" r="55" fill="#080809" stroke="rgba(245,158,11,0.2)" strokeWidth="2" />
          
          {/* Clock face & hands */}
          <circle cx="0" cy="0" r="30" fill="rgba(245,158,11,0.1)" stroke="rgba(245,158,11,0.5)" strokeWidth="2" />
          <line x1="0" y1="0" x2="0" y2="-15" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" className="origin-center animate-[spin_12s_linear_infinite]" />
          <line x1="0" y1="0" x2="15" y2="15" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" className="origin-center animate-[spin_3s_linear_infinite]" />
          
          {/* Outer spinning dash ring */}
          <circle cx="0" cy="0" r="45" stroke="#f59e0b" strokeWidth="3" strokeDasharray="15 30" fill="none" className="origin-center animate-[spin_8s_linear_infinite_reverse]" opacity="0.6" />
          
          <text x="0" y="85" fill="#f59e0b" fontSize="16" fontFamily="sans-serif" textAnchor="middle" fontWeight="900" letterSpacing="2" filter="url(#text-shadow)">TIME HELD</text>
        </g>


        {/* --- NODE 3: YIELD/WEIGHT (Bottom Center) --- */}
        <g transform="translate(300, 380)">
          {/* Ambient glow backdrop */}
          <circle cx="0" cy="0" r="70" fill="rgba(182,240,74,0.05)" />
          
          {/* Solid dark background so lines don't show through */}
          <circle cx="0" cy="0" r="55" fill="#080809" />
          
          {/* Outer radiating rings */}
          <circle cx="0" cy="0" r="55" fill="none" stroke="#B6F04A" strokeWidth="2" strokeDasharray="6 6" className="origin-center animate-[spin_20s_linear_infinite]" opacity="0.4" />
          <circle cx="0" cy="0" r="45" fill="none" stroke="#B6F04A" strokeWidth="1" strokeDasharray="2 4" className="origin-center animate-[spin_15s_linear_infinite_reverse]" opacity="0.6" />
          
          {/* Core glowing sphere */}
          <circle cx="0" cy="0" r="30" fill="#B6F04A" filter="url(#glow-lime-strong)" />
          
          <text x="0" y="7" fill="#000000" fontSize="24" fontFamily="sans-serif" textAnchor="middle" fontWeight="900">W</text>
          
          <text x="0" y="90" fill="#B6F04A" fontSize="20" fontFamily="sans-serif" textAnchor="middle" fontWeight="900" letterSpacing="3" filter="url(#text-shadow)">WEIGHT</text>
        </g>


      </svg>
    </div>
  );
}

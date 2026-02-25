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
        "relative w-full aspect-[2/1] max-w-4xl mx-auto opacity-0 translate-y-4 transition-all duration-1000 ease-out", 
        className
      )}
    >
      {/* 
        This SVG visualizes the HODLR utility: 
        1. Base balance (left, gray)
        2. Time multiplier (center, amber) 
        3. Yield/Weight (right, lime)
        The connections show how holding over time creates an exponential yield.
      */}
      <svg 
        viewBox="0 0 800 400" 
        className="w-full h-full drop-shadow-[0_0_30px_rgba(182,240,74,0.15)]"
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Defs / Gradients */}
        <defs>
          <linearGradient id="line-grad-1" x1="200" y1="200" x2="400" y2="150" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.8" />
          </linearGradient>
          
          <linearGradient id="line-grad-2" x1="400" y1="150" x2="600" y2="100" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#B6F04A" stopOpacity="1" />
          </linearGradient>
          
          <filter id="glow-lime">
            <feGaussianBlur stdDeviation="8" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        {/* Grid Background */}
        <g stroke="rgba(255,255,255,0.03)" strokeWidth="1" strokeDasharray="4 8">
          {[...Array(9)].map((_, i) => (
            <line key={`h-${i}`} x1="0" y1={i*50} x2="800" y2={i*50} />
          ))}
          {[...Array(17)].map((_, i) => (
            <line key={`v-${i}`} x1={i*50} y1="0" x2={i*50} y2="400" />
          ))}
        </g>

        {/* Base Balance Node (Left) */}
        <g transform="translate(200, 250)">
          <circle cx="0" cy="0" r="30" fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.1)" strokeWidth="2" />
          <circle cx="0" cy="0" r="15" fill="rgba(255,255,255,0.2)" />
          <text x="0" y="55" fill="rgba(255,255,255,0.4)" fontSize="12" fontFamily="monospace" textAnchor="middle" fontWeight="bold">BALANCE</text>
        </g>

        {/* Time Multiplier Node (Center) */}
        <g transform="translate(400, 200)">
          <circle cx="0" cy="0" r="40" fill="rgba(245,158,11,0.05)" stroke="rgba(245,158,11,0.2)" strokeWidth="2" />
          <circle cx="0" cy="0" r="20" fill="rgba(245,158,11,0.8)" />
          {/* Animated clock ring */}
          <circle cx="0" cy="0" r="40" stroke="#f59e0b" strokeWidth="2" strokeDasharray="10 240" fill="none" className="origin-center animate-[spin_4s_linear_infinite]" />
          <text x="0" y="65" fill="rgba(245,158,11,0.8)" fontSize="12" fontFamily="monospace" textAnchor="middle" fontWeight="bold">TIME HELD</text>
          <text x="0" y="-55" fill="rgba(245,158,11,0.6)" fontSize="14" fontFamily="monospace" textAnchor="middle" fontWeight="bold">x^{"\u03B1"}</text>
        </g>

        {/* Yield Node (Right) */}
        <g transform="translate(600, 100)">
          {/* Glowing outer rings */}
          <circle cx="0" cy="0" r="60" fill="rgba(182,240,74,0.03)" stroke="rgba(182,240,74,0.1)" strokeWidth="1" />
          <circle cx="0" cy="0" r="45" fill="none" stroke="rgba(182,240,74,0.3)" strokeWidth="2" strokeDasharray="4 4" className="origin-center animate-[spin_10s_linear_infinite_reverse]" />
          
          <circle cx="0" cy="0" r="25" fill="#B6F04A" filter="url(#glow-lime)" />
          <text x="0" y="5" fill="#000" fontSize="18" fontFamily="sans-serif" textAnchor="middle" fontWeight="900">W</text>
          <text x="0" y="85" fill="#B6F04A" fontSize="14" fontFamily="monospace" textAnchor="middle" fontWeight="bold" letterSpacing="2">WEIGHT</text>
          
          {/* Output lines representing distributions */}
          <path d="M 40,0 L 100,-30" stroke="rgba(182,240,74,0.4)" strokeWidth="2" strokeDasharray="4 4" />
          <path d="M 40,20 L 90,40" stroke="rgba(182,240,74,0.4)" strokeWidth="2" strokeDasharray="4 4" />
          <path d="M 30,-25 L 80,-60" stroke="rgba(182,240,74,0.4)" strokeWidth="2" strokeDasharray="4 4" />
        </g>

        {/* Connecting Lines */}
        {/* Balance to Time */}
        <path 
          d="M 230,240 Q 300,200 360,200" 
          stroke="url(#line-grad-1)" 
          strokeWidth="3" 
          fill="none" 
        />
        {/* Animated particles on line 1 */}
        <circle r="4" fill="#ffffff" filter="blur(1px)">
          <animateMotion path="M 230,240 Q 300,200 360,200" dur="2s" repeatCount="indefinite" />
        </circle>

        {/* Time to Yield */}
        <path 
          d="M 440,190 Q 500,100 550,100" 
          stroke="url(#line-grad-2)" 
          strokeWidth="5" 
          fill="none" 
        />
        {/* Animated particles on line 2 */}
        <circle r="6" fill="#B6F04A" filter="url(#glow-lime)">
          <animateMotion path="M 440,190 Q 500,100 550,100" dur="1.5s" repeatCount="indefinite" />
        </circle>
        
        {/* Upward trend curve showing exponential growth */}
        <path 
          d="M 150,320 Q 400,320 650,50" 
          stroke="rgba(182,240,74,0.15)" 
          strokeWidth="60" 
          fill="none" 
          strokeLinecap="round"
        />
        <path 
          d="M 150,320 Q 400,320 650,50" 
          stroke="#B6F04A" 
          strokeWidth="2" 
          fill="none" 
          strokeDasharray="8 8"
        />

        {/* Formula text overlay */}
        <text x="400" y="360" fill="rgba(255,255,255,0.2)" fontSize="16" fontFamily="monospace" textAnchor="middle" letterSpacing="4">
          W = D^α × B^β
        </text>
      </svg>
    </div>
  );
}

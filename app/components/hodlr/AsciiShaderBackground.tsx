"use client";

import { useEffect, useRef } from "react";

export function AsciiShaderBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    let animationFrameId: number;
    let time = 0;
    let dpr = 1;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = window.innerWidth + "px";
      canvas.style.height = window.innerHeight + "px";
    };
    window.addEventListener("resize", resize);
    resize();

    const chars = ".:+*#@%";

    // Wandering spotlights that roam across the canvas
    const NUM_SPOTS = 4;
    const spots = Array.from({ length: NUM_SPOTS }, (_, i) => ({
      // Each spot has its own orbit speed and phase
      speedX: 0.15 + i * 0.07,
      speedY: 0.12 + i * 0.09,
      phaseX: (i * Math.PI * 2) / NUM_SPOTS,
      phaseY: (i * Math.PI * 2) / NUM_SPOTS + 1.2,
      radius: 0.18 + (i % 2) * 0.08, // normalized radius of influence
    }));

    const draw = () => {
      time += 0.006;

      const width = canvas.width;
      const height = canvas.height;
      const baseCellSize = Math.max(10, Math.min(14, 1200 / (width / dpr) * 12));
      const cellSize = Math.round(baseCellSize * dpr);
      const cols = Math.ceil(width / cellSize);
      const rows = Math.ceil(height / cellSize);
      const cx = cols / 2;
      const cy = rows / 2;
      const maxR = Math.sqrt(cx * cx + cy * cy);

      // Pre-compute spotlight positions in normalized coords (-1 to 1)
      const spotPositions = spots.map(s => ({
        x: Math.sin(time * s.speedX + s.phaseX) * 0.7,
        y: Math.cos(time * s.speedY + s.phaseY) * 0.7,
        r: s.radius,
      }));

      ctx.fillStyle = "#080809";
      ctx.fillRect(0, 0, width, height);

      ctx.font = `${cellSize}px "JetBrains Mono","Fira Code",monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const nx = (x / cols) * 2 - 1;
          const ny = (y / rows) * 2 - 1;

          // Geometric interference pattern
          const r = Math.sqrt(nx * nx + ny * ny);
          const angle = Math.atan2(ny, nx);

          const wave1 = Math.sin(r * 6 - time * 2 + angle * 3) * 0.5;
          const wave2 = Math.cos(nx * 4 + time) * Math.sin(ny * 4 - time * 0.6) * 0.3;
          const wave3 = Math.sin(angle * 6 + r * 4 - time) * 0.2;

          let value = wave1 + wave2 + wave3;
          value = (value + 1) / 2;

          // Spotlight boost: each spot creates a bright lime zone that sweeps around
          let spotBoost = 0;
          for (let s = 0; s < spotPositions.length; s++) {
            const sp = spotPositions[s];
            const sdx = nx - sp.x;
            const sdy = ny - sp.y;
            const sd = Math.sqrt(sdx * sdx + sdy * sdy);
            if (sd < sp.r) {
              // Smooth bell-curve falloff inside the spotlight
              const intensity = Math.pow(1 - sd / sp.r, 2);
              spotBoost = Math.max(spotBoost, intensity);
            }
          }

          // Blend base pattern with spotlight
          value = value * 0.6 + value * spotBoost * 1.5;
          value = Math.min(value, 1);

          // Radial edge fade
          const dx = x - cx;
          const dy = y - cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const edgeFade = 1 - Math.pow(Math.min(dist / (maxR * 0.8), 1), 2.5);
          value *= edgeFade;

          if (value < 0.06) continue;

          const charIndex = Math.min(Math.floor(value * chars.length), chars.length - 1);
          const char = chars[charIndex];

          const px = x * cellSize + cellSize / 2;
          const py = y * cellSize + cellSize / 2;

          if (value > 0.45) {
            // Lime zone: brighter threshold, more chars hit this
            const limeIntensity = Math.min((value - 0.45) * 2, 1);
            ctx.fillStyle = "#B6F04A";
            ctx.globalAlpha = limeIntensity * edgeFade * 0.9;
            ctx.fillText(char, px, py);

            // Glow bloom pass: draw the same char again slightly larger and blurred
            if (value > 0.65) {
              ctx.globalAlpha = (value - 0.65) * 1.8 * edgeFade * 0.4;
              ctx.font = `${cellSize + 4 * dpr}px "JetBrains Mono","Fira Code",monospace`;
              ctx.fillText(char, px, py);
              ctx.font = `${cellSize}px "JetBrains Mono","Fira Code",monospace`;
            }
          } else {
            ctx.fillStyle = "#ffffff";
            ctx.globalAlpha = value * 0.1 * edgeFade;
            ctx.fillText(char, px, py);
          }
        }
      }

      ctx.globalAlpha = 1;
      animationFrameId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-0 h-full w-full pointer-events-none opacity-60"
    />
  );
}

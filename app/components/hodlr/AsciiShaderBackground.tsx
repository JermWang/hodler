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

    const draw = () => {
      time += 0.004;

      const width = canvas.width;
      const height = canvas.height;
      const baseCellSize = Math.max(10, Math.min(14, 1200 / (width / dpr) * 12));
      const cellSize = Math.round(baseCellSize * dpr);
      const cols = Math.ceil(width / cellSize);
      const rows = Math.ceil(height / cellSize);
      const cx = cols / 2;
      const cy = rows / 2;
      const maxR = Math.sqrt(cx * cx + cy * cy);

      // Slowly rotating wave directions for mesmerizing drift
      const rot1 = time * 0.3;
      const rot2 = time * 0.2;
      const rot3 = time * 0.15;

      ctx.fillStyle = "#080809";
      ctx.fillRect(0, 0, width, height);

      ctx.font = `${cellSize}px "JetBrains Mono","Fira Code",monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const nx = (x / cols) * 2 - 1;
          const ny = (y / rows) * 2 - 1;

          const r = Math.sqrt(nx * nx + ny * ny);
          const angle = Math.atan2(ny, nx);

          // Layer 1: Expanding concentric rings that breathe in and out
          const rings = Math.sin(r * 8 - time * 1.5) * 0.5 + 0.5;

          // Layer 2: Spiral arms that slowly rotate (creates hypnotic spin)
          const spiral = Math.sin(angle * 3 + r * 5 - time * 2) * 0.5 + 0.5;

          // Layer 3: Broad directional waves with rotating direction vectors
          // These create the large sweeping bands
          const d1x = Math.cos(rot1);
          const d1y = Math.sin(rot1);
          const d2x = Math.cos(rot2 + 2.1);
          const d2y = Math.sin(rot2 + 2.1);
          const d3x = Math.cos(rot3 + 4.2);
          const d3y = Math.sin(rot3 + 4.2);

          const sweep1 = Math.sin((nx * d1x + ny * d1y) * 2.5 - time * 0.8) * 0.5 + 0.5;
          const sweep2 = Math.sin((nx * d2x + ny * d2y) * 2.0 - time * 0.6) * 0.5 + 0.5;
          const sweep3 = Math.sin((nx * d3x + ny * d3y) * 1.8 - time * 0.5) * 0.5 + 0.5;

          // Combine: rings give structure, spiral gives rotation, sweeps give broad motion
          let value = rings * 0.2 + spiral * 0.25 + sweep1 * 0.35 + sweep2 * 0.3 + sweep3 * 0.25;
          // Normalize roughly to 0-1
          value = value / 1.0;
          value = Math.min(value, 1);

          // Radial edge fade
          const dx = x - cx;
          const dy = y - cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const edgeFade = 1 - Math.pow(Math.min(dist / (maxR * 0.85), 1), 2);
          value *= edgeFade;

          if (value < 0.1) continue;

          const charIndex = Math.min(Math.floor(value * chars.length), chars.length - 1);
          const char = chars[charIndex];

          const px = x * cellSize + cellSize / 2;
          const py = y * cellSize + cellSize / 2;

          if (value > 0.5) {
            const limeIntensity = Math.min((value - 0.5) * 2.5, 1);
            ctx.fillStyle = "#B6F04A";
            ctx.globalAlpha = limeIntensity * edgeFade * 0.85;
            ctx.fillText(char, px, py);

            // Bloom glow on the brightest chars
            if (value > 0.7) {
              ctx.globalAlpha = (value - 0.7) * 2 * edgeFade * 0.35;
              ctx.font = `${cellSize + 4 * dpr}px "JetBrains Mono","Fira Code",monospace`;
              ctx.fillText(char, px, py);
              ctx.font = `${cellSize}px "JetBrains Mono","Fira Code",monospace`;
            }
          } else {
            ctx.fillStyle = "#ffffff";
            ctx.globalAlpha = value * 0.12 * edgeFade;
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

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

      // Slowly rotating wave directions for mesmerizing drift
      const rot1 = time * 0.3;
      const rot2 = time * 0.2;
      const rot3 = time * 0.15;

      ctx.fillStyle = "#080809";
      ctx.fillRect(0, 0, width, height);

      ctx.font = `${cellSize}px "JetBrains Mono","Fira Code",monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      // Pre-compute rotating direction vectors for flowing waves
      const d1x = Math.cos(rot1);
      const d1y = Math.sin(rot1);
      const d2x = Math.cos(rot2 + 2.1);
      const d2y = Math.sin(rot2 + 2.1);
      const d3x = Math.cos(rot3 + 4.2);
      const d3y = Math.sin(rot3 + 4.2);

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const nx = (x / cols) * 2 - 1;
          const ny = (y / rows) * 2 - 1;

          // Pure directional flowing waves - no radial concentration
          // Each wave sweeps across the full screen as a broad pulse
          const sweep1 = Math.sin((nx * d1x + ny * d1y) * 1.8 - time * 0.6) * 0.5 + 0.5;
          const sweep2 = Math.sin((nx * d2x + ny * d2y) * 1.4 - time * 0.45) * 0.5 + 0.5;
          const sweep3 = Math.sin((nx * d3x + ny * d3y) * 1.2 - time * 0.35) * 0.5 + 0.5;

          // A subtle texture layer so it's not perfectly smooth
          const texture = Math.sin(nx * 6 + ny * 4 + time * 0.3) * 0.1 + 0.1;

          let value = sweep1 * 0.4 + sweep2 * 0.35 + sweep3 * 0.3 + texture;
          value = Math.min(value, 1);

          // Very gentle edge fade - only the outermost 10% of each edge
          const ex = 1 - Math.pow(Math.max(0, Math.abs(nx) - 0.85) / 0.15, 2);
          const ey = 1 - Math.pow(Math.max(0, Math.abs(ny) - 0.85) / 0.15, 2);
          const edgeFade = ex * ey;
          value *= edgeFade;

          if (value < 0.08) continue;

          const charIndex = Math.min(Math.floor(value * chars.length), chars.length - 1);
          const char = chars[charIndex];

          const px = x * cellSize + cellSize / 2;
          const py = y * cellSize + cellSize / 2;

          if (value > 0.45) {
            const limeIntensity = Math.min((value - 0.45) * 2.5, 1);
            ctx.fillStyle = "#B6F04A";
            ctx.globalAlpha = limeIntensity * 0.8;
            ctx.fillText(char, px, py);

            // Bloom glow on the brightest chars
            if (value > 0.65) {
              ctx.globalAlpha = (value - 0.65) * 2 * 0.3;
              ctx.font = `${cellSize + 4 * dpr}px "JetBrains Mono","Fira Code",monospace`;
              ctx.fillText(char, px, py);
              ctx.font = `${cellSize}px "JetBrains Mono","Fira Code",monospace`;
            }
          } else {
            ctx.fillStyle = "#ffffff";
            ctx.globalAlpha = value * 0.1;
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

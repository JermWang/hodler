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
      time += 0.008;

      const width = canvas.width;
      const height = canvas.height;
      // Responsive cell size: smaller on desktop for higher density
      const baseCellSize = Math.max(10, Math.min(14, 1200 / (width / dpr) * 12));
      const cellSize = Math.round(baseCellSize * dpr);
      const cols = Math.ceil(width / cellSize);
      const rows = Math.ceil(height / cellSize);
      const cx = cols / 2;
      const cy = rows / 2;
      // Max distance from center for radial fade
      const maxR = Math.sqrt(cx * cx + cy * cy);

      ctx.fillStyle = "#080809";
      ctx.fillRect(0, 0, width, height);

      ctx.font = `${cellSize}px "JetBrains Mono","Fira Code",monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const nx = (x / cols) * 2 - 1;
          const ny = (y / rows) * 2 - 1;

          // Smoother, more geometric interference
          const r = Math.sqrt(nx * nx + ny * ny);
          const angle = Math.atan2(ny, nx);

          const wave1 = Math.sin(r * 6 - time * 2 + angle * 3) * 0.5;
          const wave2 = Math.cos(nx * 4 + time) * Math.sin(ny * 4 - time * 0.6) * 0.3;
          const wave3 = Math.sin(angle * 6 + r * 4 - time) * 0.2;

          let value = wave1 + wave2 + wave3;
          value = (value + 1) / 2;

          // Radial edge fade: smooth falloff from center
          const dx = x - cx;
          const dy = y - cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const edgeFade = 1 - Math.pow(Math.min(dist / (maxR * 0.75), 1), 2);
          value *= edgeFade;

          if (value < 0.08) continue;

          const charIndex = Math.min(Math.floor(value * chars.length), chars.length - 1);
          const char = chars[charIndex];

          if (value > 0.7) {
            ctx.fillStyle = "#B6F04A";
            ctx.globalAlpha = Math.min((value - 0.7) * 2.5, 1) * edgeFade * 0.7;
          } else {
            ctx.fillStyle = "#ffffff";
            ctx.globalAlpha = value * 0.06 * edgeFade;
          }

          ctx.fillText(char, x * cellSize + cellSize / 2, y * cellSize + cellSize / 2);
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
      className="fixed inset-0 z-0 h-full w-full pointer-events-none opacity-50"
    />
  );
}

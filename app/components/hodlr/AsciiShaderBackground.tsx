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

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", resize);
    resize();

    // Characters for ASCII shading (dark to light)
    const density = " ░▒▓█▄▀▌▐████████";

    const draw = () => {
      time += 0.015;
      
      const width = canvas.width;
      const height = canvas.height;
      const cellSize = 16;
      const cols = Math.ceil(width / cellSize);
      const rows = Math.ceil(height / cellSize);

      ctx.fillStyle = "#080809";
      ctx.fillRect(0, 0, width, height);

      ctx.font = `bold ${cellSize}px "JetBrains Mono", "Fira Code", monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          // Normalized coordinates (-1 to 1)
          const nx = (x / cols) * 2 - 1;
          const ny = (y / rows) * 2 - 1;

          // Geometric shader logic
          // Creates overlapping interference patterns
          const wave1 = Math.sin(nx * 5 + time) * Math.cos(ny * 3 - time * 0.8);
          const wave2 = Math.cos(Math.sqrt(nx * nx + ny * ny) * 8 - time * 1.5);
          const wave3 = Math.sin(nx * ny * 10 + time * 0.5);

          // Combine waves and normalize to 0-1 range
          let value = (wave1 + wave2 + wave3) / 3;
          value = (value + 1) / 2;

          // Map to character density
          const charIndex = Math.floor(value * (density.length - 1));
          const char = density[charIndex] || " ";

          // Skip drawing empty spaces to save performance
          if (char === " ") continue;

          // Calculate color based on value
          // Higher values get the lime accent, lower values get dark gray
          if (value > 0.85) {
            ctx.fillStyle = "#B6F04A"; // Accent lime
            ctx.globalAlpha = (value - 0.85) * 4; // Fade in bright spots
          } else {
            ctx.fillStyle = "#ffffff";
            ctx.globalAlpha = value * 0.08; // Very subtle gray for background structure
          }

          ctx.fillText(char, x * cellSize + cellSize / 2, y * cellSize + cellSize / 2);
        }
      }

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
      className="fixed inset-0 z-0 h-full w-full pointer-events-none opacity-60 mix-blend-screen"
    />
  );
}

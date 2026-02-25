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

    // Large sweeping wave fronts that roll across the canvas
    const waves = [
      { dirX: 1.0, dirY: 0.3, speed: 0.4, freq: 1.2, width: 0.6 },
      { dirX: -0.5, dirY: 1.0, speed: 0.3, freq: 0.8, width: 0.7 },
      { dirX: 0.7, dirY: -0.7, speed: 0.25, freq: 1.0, width: 0.55 },
    ];

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

      // No pre-computation needed - waves are calculated inline

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

          // Sweeping wave fronts: broad bands of lime that roll across the field
          let waveBoost = 0;
          for (let w = 0; w < waves.length; w++) {
            const wv = waves[w];
            // Project pixel onto wave direction to get a 1D position along the wave
            const proj = nx * wv.dirX + ny * wv.dirY;
            // Sine wave that travels along that direction over time
            const pulse = Math.sin(proj * wv.freq * Math.PI - time * wv.speed);
            // Smooth the pulse into a wide band (wider = bigger sweep)
            const band = Math.pow(Math.max(0, pulse), 0.8);
            waveBoost += band * wv.width;
          }
          waveBoost = Math.min(waveBoost, 1.5);

          // Blend base pattern with wave boost
          value = value * 0.4 + value * waveBoost * 1.2;
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

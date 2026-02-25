"use client";

import { useEffect, useRef } from "react";

const MATH_SYMBOLS = [
  "∑", "∏", "∫", "∂", "√", "∞", "≈", "≠", "≤", "≥",
  "α", "β", "γ", "δ", "θ", "λ", "μ", "π", "σ", "φ",
  "Δ", "Ω", "∇", "∈", "∉", "⊂", "⊃", "∪", "∩", "×",
  "÷", "±", "∓", "∝", "∀", "∃", "∄", "∧", "∨", "⊕",
];

const FORMULAS = [
  "w = d^α × b^β",
  "∑(weight_i)",
  "rank = f(t,b)",
  "α = 0.6",
  "β = 0.4", 
  "reward = pool × w/W",
  "duration++",
  "yield = ∫dt",
  "∂w/∂t > 0",
  "lim t→∞",
  "HODL = ∞",
  "diamond^hands",
  "√(balance)",
  "log(days)",
  "e^(holding)",
];

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  text: string;
  opacity: number;
  size: number;
  type: "symbol" | "formula";
}

export function AsciiMathBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animationRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    // Initialize particles
    const initParticles = () => {
      const particles: Particle[] = [];
      const particleCount = Math.floor((canvas.width * canvas.height) / 25000);

      for (let i = 0; i < particleCount; i++) {
        const isFormula = Math.random() > 0.7;
        particles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          vx: (Math.random() - 0.5) * 0.3,
          vy: (Math.random() - 0.5) * 0.3 + 0.1,
          text: isFormula 
            ? FORMULAS[Math.floor(Math.random() * FORMULAS.length)]
            : MATH_SYMBOLS[Math.floor(Math.random() * MATH_SYMBOLS.length)],
          opacity: Math.random() * 0.15 + 0.05,
          size: isFormula ? 12 + Math.random() * 4 : 14 + Math.random() * 10,
          type: isFormula ? "formula" : "symbol",
        });
      }
      particlesRef.current = particles;
    };

    initParticles();

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particlesRef.current.forEach((particle) => {
        // Update position
        particle.x += particle.vx;
        particle.y += particle.vy;

        // Wrap around edges
        if (particle.x < -100) particle.x = canvas.width + 100;
        if (particle.x > canvas.width + 100) particle.x = -100;
        if (particle.y < -50) particle.y = canvas.height + 50;
        if (particle.y > canvas.height + 50) particle.y = -50;

        // Draw particle
        ctx.save();
        ctx.globalAlpha = particle.opacity;
        ctx.font = `${particle.size}px "JetBrains Mono", "Fira Code", monospace`;
        ctx.fillStyle = particle.type === "formula" ? "#B6F04A" : "#4a5568";
        ctx.fillText(particle.text, particle.x, particle.y);
        ctx.restore();
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      cancelAnimationFrame(animationRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
      style={{ opacity: 0.6 }}
    />
  );
}

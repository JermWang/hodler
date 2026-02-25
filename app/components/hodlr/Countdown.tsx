"use client";

import { cn } from "@/app/lib/utils";
import { useEffect, useState } from "react";

interface CountdownProps {
  targetUnix: number;
  label?: string;
  className?: string;
  onComplete?: () => void;
}

function formatTimeLeft(seconds: number): { days: number; hours: number; minutes: number; secs: number } {
  if (seconds <= 0) return { days: 0, hours: 0, minutes: 0, secs: 0 };
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return { days, hours, minutes, secs };
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

export function Countdown({ targetUnix, label, className, onComplete }: CountdownProps) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const interval = setInterval(() => {
      const current = Math.floor(Date.now() / 1000);
      setNow(current);
      if (current >= targetUnix) {
        onComplete?.();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [targetUnix, onComplete]);

  const diff = Math.max(0, targetUnix - now);
  const { days, hours, minutes, secs } = formatTimeLeft(diff);
  const isComplete = diff <= 0;

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {label && <div className="text-xs text-[#9AA3B2] uppercase tracking-wider">{label}</div>}
      <div className="flex items-baseline gap-1 font-mono text-white">
        {days > 0 && (
          <>
            <span className="text-2xl font-bold">{days}</span>
            <span className="text-xs text-[#9AA3B2] mr-2">d</span>
          </>
        )}
        <span className="text-2xl font-bold">{pad(hours)}</span>
        <span className="text-lg text-[#9AA3B2]">:</span>
        <span className="text-2xl font-bold">{pad(minutes)}</span>
        <span className="text-lg text-[#9AA3B2]">:</span>
        <span className="text-2xl font-bold">{pad(secs)}</span>
      </div>
      {isComplete && <div className="text-xs text-emerald-400">Complete</div>}
    </div>
  );
}

interface CompactCountdownProps {
  targetUnix: number;
  className?: string;
}

export function CompactCountdown({ targetUnix, className }: CompactCountdownProps) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const interval = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(interval);
  }, []);

  const diff = Math.max(0, targetUnix - now);
  const { days, hours, minutes, secs } = formatTimeLeft(diff);

  if (diff <= 0) {
    return <span className={cn("font-mono text-emerald-400", className)}>00:00:00</span>;
  }

  const display = days > 0 ? `${days}d ${pad(hours)}:${pad(minutes)}` : `${pad(hours)}:${pad(minutes)}:${pad(secs)}`;

  return <span className={cn("font-mono text-white", className)}>{display}</span>;
}

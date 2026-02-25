"use client";

import { useEffect, useState } from "react";

interface BoardClientProps {
  targetUnix: number;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

export default function BoardClient({ targetUnix }: BoardClientProps) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const interval = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(interval);
  }, []);

  const diff = Math.max(0, targetUnix - now);
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  const secs = Math.floor(diff % 60);

  const display = diff <= 0
    ? "Ended"
    : days > 0
    ? `${days}d ${pad(hours)}:${pad(minutes)}:${pad(secs)}`
    : `${pad(hours)}:${pad(minutes)}:${pad(secs)}`;

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-[#9AA3B2]">Ends in</span>
      <span className="font-mono text-sm font-semibold text-white">{display}</span>
    </div>
  );
}

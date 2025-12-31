"use client";

import { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "cts_closed_beta_notice_dismissed_v1";
const DEFAULT_BETA_START_ISO = "2026-01-06T00:00:00-08:00";

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function daysUntil(target: Date, now: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const t = startOfLocalDay(target).getTime();
  const n = startOfLocalDay(now).getTime();
  return Math.ceil((t - n) / msPerDay);
}

function msUntilNextLocalMidnight(now: Date): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return Math.max(500, next.getTime() - now.getTime());
}

export default function ClosedBetaNotice() {
  const betaStart = useMemo(() => {
    const raw = String(process.env.NEXT_PUBLIC_CLOSED_BETA_START_ISO ?? "").trim();
    const d = new Date(raw || DEFAULT_BETA_START_ISO);
    if (!Number.isFinite(d.getTime())) return new Date(DEFAULT_BETA_START_ISO);
    return d;
  }, []);

  const [dismissed, setDismissed] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (typeof window === "undefined") return;

    let intervalId: number | null = null;

    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === "1") setDismissed(true);

    setNow(new Date());

    const tick = () => setNow(new Date());
    const t1 = window.setTimeout(() => {
      tick();
      intervalId = window.setInterval(tick, 24 * 60 * 60 * 1000);
    }, msUntilNextLocalMidnight(new Date()));

    return () => {
      window.clearTimeout(t1);
      if (intervalId != null) window.clearInterval(intervalId);
    };
  }, []);

  if (dismissed) return null;

  const d = daysUntil(betaStart, now);

  const label =
    d > 1
      ? `Closed beta opens in ${d} days.`
      : d === 1
        ? "Closed beta opens in 1 day."
        : d === 0
          ? "Closed beta opens today."
          : "Closed beta is live.";

  return (
    <div className="closedBetaNotice" role="status" aria-live="polite">
      <div className="closedBetaNoticeText">
        <span className="closedBetaNoticeEm">{label}</span>
        {d > 0 ? " Flagship launch is live now." : null}
      </div>

      <button
        type="button"
        className="closedBetaNoticeClose"
        aria-label="Dismiss"
        onClick={() => {
          try {
            window.localStorage.setItem(STORAGE_KEY, "1");
          } catch {
          }
          setDismissed(true);
        }}
      >
        ×
      </button>
    </div>
  );
}

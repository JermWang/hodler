"use client";

import { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "cts_beta_notice_dismissed_v2";
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

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

export default function ClosedBetaNotice() {
  const betaStart = useMemo(() => {
    const raw = String(process.env.NEXT_PUBLIC_CLOSED_BETA_START_ISO ?? "").trim();
    const d = new Date(raw || DEFAULT_BETA_START_ISO);
    if (!Number.isFinite(d.getTime())) return new Date(DEFAULT_BETA_START_ISO);
    return d;
  }, []);

  const [dismissed, setDismissed] = useState(true); // Start dismissed to avoid flash
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (typeof window === "undefined") return;
    setNow(new Date());
    const stored = window.localStorage.getItem(STORAGE_KEY);
    setDismissed(stored === "1");
  }, []);

  const d = daysUntil(betaStart, now);
  const isBetaOpen = d <= 0;

  if (isBetaOpen || dismissed) return null;

  const countdownLabel =
    d > 1
      ? `${d} days`
      : d === 1
        ? "1 day"
        : "Today";

  const handleDismiss = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {}
    setDismissed(true);
  };

  return (
    <div className="betaNoticeCard">
      <button className="betaNoticeClose" onClick={handleDismiss} aria-label="Dismiss">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
      
      <div className="betaNoticeIcon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      </div>
      
      <div className="betaNoticeContent">
        <h3 className="betaNoticeTitle">Closed Beta Coming Soon</h3>
        <p className="betaNoticeText">
          Public launches open <strong>{formatDate(betaStart)}</strong> ({countdownLabel}).
          You can still explore the interface below.
        </p>
      </div>
    </div>
  );
}

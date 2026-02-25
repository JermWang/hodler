"use client";

import { useEffect, useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import bs58 from "bs58";

import { useToast } from "@/app/components/ToastProvider";

async function readJsonSafe(res: Response): Promise<any> {
  const text = await res.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

export default function AdminPage() {
  const toast = useToast();
  const { publicKey, connected, signMessage } = useWallet();

  const [sessionWallet, setSessionWallet] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connectedWallet = useMemo(() => publicKey?.toBase58?.() ?? null, [publicKey]);

  async function refreshSession() {
    const res = await fetch("/api/admin/me", { cache: "no-store", credentials: "include" });
    const json = await readJsonSafe(res);
    if (!res.ok) throw new Error(json?.error ?? `Request failed (${res.status})`);
    const w = typeof json?.walletPubkey === "string" ? json.walletPubkey.trim() : "";
    setSessionWallet(w || null);
  }

  useEffect(() => {
    refreshSession().catch(() => null);
  }, []);

  async function adminLogin() {
    setError(null);
    setBusy("Signing admin login...");
    try {
      if (!connected || !connectedWallet) throw new Error("Connect your wallet first");
      if (!signMessage) throw new Error("Wallet does not support message signing");

      const nonceRes = await fetch("/api/admin/nonce", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ walletPubkey: connectedWallet }),
        credentials: "include",
      });
      const nonceJson = await readJsonSafe(nonceRes);
      if (!nonceRes.ok) throw new Error(nonceJson?.error ?? `Nonce failed (${nonceRes.status})`);

      const message = String(nonceJson?.message ?? "");
      const nonce = String(nonceJson?.nonce ?? "");
      if (!message || !nonce) throw new Error("Invalid nonce response");

      const signatureBytes = await signMessage(new TextEncoder().encode(message));
      const signatureB58 = bs58.encode(signatureBytes);

      const loginRes = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ walletPubkey: connectedWallet, nonce, signatureB58 }),
        credentials: "include",
      });
      const loginJson = await readJsonSafe(loginRes);
      if (!loginRes.ok) throw new Error(loginJson?.error ?? `Login failed (${loginRes.status})`);

      await refreshSession();
      toast({ kind: "success", message: "Admin login successful" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function adminLogout() {
    setError(null);
    setBusy("Logging out...");
    try {
      const res = await fetch("/api/admin/logout", { method: "POST", credentials: "include" });
      const json = await readJsonSafe(res);
      if (!res.ok) throw new Error(json?.error ?? `Logout failed (${res.status})`);
      await refreshSession();
      toast({ kind: "success", message: "Logged out" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function runCron(path: string, label: string) {
    setError(null);
    setBusy(label);
    try {
      const res = await fetch(path, { method: "POST", credentials: "include" });
      const json = await readJsonSafe(res);
      if (!res.ok) throw new Error(json?.error ?? `Failed (${res.status})`);
      toast({ kind: "success", message: json?.message ?? `${label} complete` });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="utilityPage">
      <div className="utilityWrap">
        <div className="utilityHeader">
          <div className="utilityHeaderTop">
            <div className="utilityHeaderLeft">
              <div className="utilityBreadcrumb">
                <a href="/" className="utilityBreadcrumbLink">Home</a>
                <span className="utilityBreadcrumbSep">/</span>
                <span>Admin</span>
              </div>
              <h1 className="utilityTitle">Admin</h1>
              <p className="utilityLead">Admin tools for HODLR epoch management.</p>
            </div>
          </div>
        </div>

        {error ? (
          <div className="utilityAlert utilityAlertError" style={{ marginTop: 24 }}>{error}</div>
        ) : null}

        <div className="utilityCard" style={{ marginTop: 24 }}>
          <div className="utilityCardHeader">
            <h2 className="utilityCardTitle">Admin Session</h2>
            <p className="utilityCardSub">Connect your wallet and sign once to create an admin session.</p>
          </div>
          <div className="utilityCardBody">
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <WalletMultiButton />
              <button className="utilityBtn utilityBtnPrimary" onClick={() => adminLogin().catch(() => null)} disabled={!!busy}>
                {busy?.startsWith("Signing") ? busy : "Admin login"}
              </button>
              <button className="utilityBtn" onClick={() => adminLogout().catch(() => null)} disabled={!!busy}>
                Logout
              </button>
            </div>
            <div className="utilityStats" style={{ marginTop: 20 }}>
              <div className="utilityStat">
                <div className="utilityStatLabel">Connected wallet</div>
                <div className="utilityStatValue" style={{ fontSize: 12 }}>{connectedWallet ?? "-"}</div>
              </div>
              <div className="utilityStat">
                <div className="utilityStatLabel">Admin session</div>
                <div className="utilityStatValue" style={{ fontSize: 12 }}>{sessionWallet ?? "Not logged in"}</div>
              </div>
            </div>
          </div>
        </div>

        {sessionWallet && (
          <>
            <div className="utilityCard" style={{ marginTop: 24 }}>
              <div className="utilityCardHeader">
                <h2 className="utilityCardTitle">Epoch Pipeline</h2>
                <p className="utilityCardSub">Manually trigger HODLR cron jobs for testing.</p>
              </div>
              <div className="utilityCardBody" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {[
                  { path: "/api/cron/hodlr-snapshot", label: "Run Snapshot" },
                  { path: "/api/cron/hodlr-rank", label: "Run Rank" },
                  { path: "/api/cron/hodlr-distribution-dry-run", label: "Distribution Dry Run" },
                  { path: "/api/cron/hodlr-payout-dry-run", label: "Payout Dry Run" },
                  { path: "/api/cron/hodlr-claim-open", label: "Open Claim Window" },
                  { path: "/api/cron/hodlr-claim-close", label: "Close Claim Window" },
                  { path: "/api/cron/hodlr-advance", label: "Advance Epoch" },
                ].map(({ path, label }) => (
                  <div key={path} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "12px 16px", background: "rgba(255,255,255,0.04)", borderRadius: 8 }}>
                    <span style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", fontFamily: "monospace" }}>{path}</span>
                    <button
                      className="utilityBtn utilityBtnPrimary"
                      onClick={() => runCron(path, label)}
                      disabled={!!busy}
                      style={{ minWidth: 160 }}
                    >
                      {busy === label ? `${label}...` : label}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="utilityCard" style={{ marginTop: 24 }}>
              <div className="utilityCardHeader">
                <h2 className="utilityCardTitle">Health</h2>
              </div>
              <div className="utilityCardBody">
                <button
                  className="utilityBtn"
                  onClick={() => runCron("/api/health", "Health Check")}
                  disabled={!!busy}
                >
                  {busy === "Health Check" ? "Checking..." : "Check Health"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

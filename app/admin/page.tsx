"use client";

import { useEffect, useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import bs58 from "bs58";

import { useToast } from "@/app/components/ToastProvider";

type PoolStatus = {
  ok: boolean;
  suffix: string;
  availableCount: number;
  usedCount: number;
  totalCount: number;
};

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
  const [pool, setPool] = useState<PoolStatus | null>(null);

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [suffix, setSuffix] = useState<string>("pump");
  const [count, setCount] = useState<string>("3");
  const [results, setResults] = useState<Array<{ publicKey: string; duration?: number; attempts?: number }>>([]);

  const connectedWallet = useMemo(() => publicKey?.toBase58?.() ?? null, [publicKey]);

  async function refreshSession() {
    const res = await fetch("/api/admin/me", { cache: "no-store", credentials: "include" });
    const json = await readJsonSafe(res);
    if (!res.ok) throw new Error(json?.error ?? `Request failed (${res.status})`);
    const w = typeof json?.walletPubkey === "string" ? json.walletPubkey.trim() : "";
    setSessionWallet(w || null);
  }

  async function refreshPool() {
    const sp = new URLSearchParams();
    sp.set("suffix", String(suffix || "pump").trim() || "pump");
    const res = await fetch(`/api/admin/vanity/pool?${sp.toString()}`, { cache: "no-store", credentials: "include" });
    const json = await readJsonSafe(res);
    if (!res.ok) throw new Error(json?.error ?? `Request failed (${res.status})`);
    setPool(json as PoolStatus);
  }

  useEffect(() => {
    refreshSession().catch(() => null);
  }, []);

  useEffect(() => {
    if (!sessionWallet) return;
    refreshPool().catch(() => null);
  }, [sessionWallet, suffix]);

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
      const res = await fetch("/api/admin/logout", {
        method: "POST",
        credentials: "include",
      });
      const json = await readJsonSafe(res);
      if (!res.ok) throw new Error(json?.error ?? `Logout failed (${res.status})`);
      await refreshSession();
      setPool(null);
      toast({ kind: "success", message: "Logged out" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function generateVanityOnce() {
    const suffixValue = String(suffix || "pump").trim() || "pump";

    const res = await fetch("/api/vanity/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ suffix: suffixValue, maxAttempts: 50_000_000, addToCache: true }),
    });
    const json = await readJsonSafe(res);
    if (!res.ok) throw new Error(json?.error ?? `Generate failed (${res.status})`);

    const pk = String(json?.publicKey ?? "").trim();
    if (pk) {
      setResults((prev) => [{ publicKey: pk, duration: json?.duration, attempts: json?.attempts }, ...prev].slice(0, 20));
    }
  }

  async function generateBatch() {
    setError(null);
    setBusy("Generating...");
    try {
      if (!sessionWallet) throw new Error("Admin login required");

      const n = Math.max(1, Math.min(5, Math.floor(Number(count || "1"))));
      for (let i = 0; i < n; i++) {
        setBusy(`Generating ${i + 1}/${n}...`);
        await generateVanityOnce();
      }

      await refreshPool();
      toast({ kind: "success", message: "Generated vanity mint(s)" });
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
              <p className="utilityLead">Admin-only tools for maintenance tasks.</p>
            </div>
          </div>
        </div>

        {error ? (
          <div className="utilityAlert utilityAlertError" style={{ marginTop: 24 }}>
            {error}
          </div>
        ) : null}

        <div className="utilityCard" style={{ marginTop: 24 }}>
          <div className="utilityCardHeader">
            <h2 className="utilityCardTitle">Admin Session</h2>
            <p className="utilityCardSub">Connect your wallet, then sign once to create an admin session cookie.</p>
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

            <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
              <button className="utilityBtn" onClick={() => refreshSession().catch(() => null)} disabled={!!busy}>
                Refresh
              </button>
            </div>
          </div>
        </div>

        <div className="utilityCard" style={{ marginTop: 24 }}>
          <div className="utilityCardHeader">
            <h2 className="utilityCardTitle">Vanity Mint Pool</h2>
            <p className="utilityCardSub">Generate vanity mints ahead of time so launches can stay fast.</p>
          </div>
          <div className="utilityCardBody">
            <div className="utilityGrid utilityGrid3">
              <div className="utilityField">
                <label className="utilityLabel">Suffix</label>
                <input className="utilityInput" value={suffix} onChange={(e) => setSuffix(e.target.value)} placeholder="pump" />
              </div>
              <div className="utilityField">
                <label className="utilityLabel">Count (max 5 per 5 min)</label>
                <input className="utilityInput" value={count} onChange={(e) => setCount(e.target.value)} placeholder="3" />
              </div>
              <div className="utilityField">
                <label className="utilityLabel">Action</label>
                <button className="utilityBtn utilityBtnPrimary" onClick={() => generateBatch().catch(() => null)} disabled={!!busy || !sessionWallet}>
                  {busy?.startsWith("Generating") ? busy : "Generate"}
                </button>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
              <button className="utilityBtn" onClick={() => refreshPool().catch(() => null)} disabled={!!busy || !sessionWallet}>
                Refresh pool status
              </button>
              <a className="utilityBtn" href="/admin/audit-logs">
                View audit logs
              </a>
            </div>

            <div className="utilityStats" style={{ marginTop: 20 }}>
              <div className="utilityStat">
                <div className="utilityStatLabel">Available</div>
                <div className="utilityStatValue">{pool?.availableCount ?? "-"}</div>
              </div>
              <div className="utilityStat">
                <div className="utilityStatLabel">Used</div>
                <div className="utilityStatValue">{pool?.usedCount ?? "-"}</div>
              </div>
              <div className="utilityStat">
                <div className="utilityStatLabel">Total</div>
                <div className="utilityStatValue">{pool?.totalCount ?? "-"}</div>
              </div>
            </div>

            {results.length ? (
              <div className="utilitySection" style={{ marginTop: 20 }}>
                <h3 className="utilitySectionTitle">Recent generated</h3>
                <div className="utilityList">
                  {results.map((r) => (
                    <div key={r.publicKey} className="utilityListItem">
                      <div className="utilityListItemContent">
                        <div className="utilityListItemTitle" style={{ fontSize: 14 }}>{r.publicKey}</div>
                        <div className="utilityListItemMeta">
                          {typeof r.duration === "number" ? `${r.duration}ms` : ""}
                          {typeof r.attempts === "number" ? ` ${r.attempts} attempts` : ""}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}

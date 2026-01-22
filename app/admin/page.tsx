"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { isValidAmpVanityAddress } from "@/app/lib/vanityKeypair";

import { useToast } from "@/app/components/ToastProvider";

function DVDBouncingText() {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 50, y: 50 });
  const [vel, setVel] = useState({ x: 2, y: 1.5 });
  const [hue, setHue] = useState(0);

  useEffect(() => {
    let animationId: number;
    
    const animate = () => {
      if (!containerRef.current || !textRef.current) {
        animationId = requestAnimationFrame(animate);
        return;
      }

      const container = containerRef.current.getBoundingClientRect();
      const text = textRef.current.getBoundingClientRect();

      setPos((p) => {
        let newX = p.x + vel.x;
        let newY = p.y + vel.y;
        let newVelX = vel.x;
        let newVelY = vel.y;
        let hitCorner = false;

        if (newX <= 0 || newX + text.width >= container.width) {
          newVelX = -vel.x;
          newX = newX <= 0 ? 0 : container.width - text.width;
          hitCorner = true;
        }
        if (newY <= 0 || newY + text.height >= container.height) {
          newVelY = -vel.y;
          newY = newY <= 0 ? 0 : container.height - text.height;
          hitCorner = true;
        }

        if (hitCorner) {
          setVel({ x: newVelX, y: newVelY });
          setHue((h) => (h + 60) % 360);
        }

        return { x: newX, y: newY };
      });

      animationId = requestAnimationFrame(animate);
    };

    animationId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationId);
  }, [vel]);

  return (
    <div 
      ref={containerRef}
      className="absolute inset-0 overflow-hidden pointer-events-none"
      style={{ zIndex: 0 }}
    >
      <div
        ref={textRef}
        className="absolute whitespace-nowrap font-bold text-lg md:text-xl transition-colors duration-300"
        style={{
          left: pos.x,
          top: pos.y,
          color: `hsl(${hue}, 100%, 60%)`,
          textShadow: `0 0 10px hsl(${hue}, 100%, 50%)`,
        }}
      >
        if you&apos;re reading this and ur not the admin, i fucked ur mom and ur gay :)
      </div>
    </div>
  );
}

type PoolStatus = {
  ok: boolean;
  suffix: string;
  availableCount: number;
  usedCount: number;
  totalCount: number;
  upcomingAddresses?: Array<{
    position: number;
    publicKey: string;
    createdAt: number;
  }>;
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

  const TARGET_POOL_SIZE = 50; // Target number of vanity addresses to maintain
  const [results, setResults] = useState<Array<{ publicKey: string; duration?: number; attempts?: number }>>([]);
  const [progressAttempts, setProgressAttempts] = useState<number>(0);

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
    sp.set("suffix", "AMP");
    const res = await fetch(`/api/admin/vanity/pool?${sp.toString()}`, { cache: "no-store", credentials: "include" });
    const json = await readJsonSafe(res);
    if (!res.ok) throw new Error(json?.error ?? `Request failed (${res.status})`);
    setPool(json as PoolStatus);
  }

  async function cleanupInvalidVanity() {
    setBusy("Cleaning up invalid vanity addresses...");
    setError(null);
    try {
      const res = await fetch("/api/admin/vanity/pool", {
        method: "POST",
        credentials: "include",
      });
      const json = await readJsonSafe(res);
      if (!res.ok) throw new Error(json?.error ?? `Cleanup failed (${res.status})`);
      await refreshPool();
      toast({ 
        kind: "success", 
        message: `Cleaned up ${json.removed} invalid addresses (kept ${json.kept})` 
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    refreshSession().catch(() => null);
  }, []);

  useEffect(() => {
    if (!sessionWallet) return;
    refreshPool().catch(() => null);
  }, [sessionWallet]);

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
    const suffixValue = "AMP";

    const batchSize = 10_000;
    const maxAttempts = 50_000_000;
    let attempts = 0;
    const start = Date.now();

    while (attempts < maxAttempts) {
      for (let i = 0; i < batchSize && attempts < maxAttempts; i++) {
        const kp = Keypair.generate();
        attempts++;
        const pub = kp.publicKey.toBase58();
        // Must end with AMP and have lowercase char before it
        if (isValidAmpVanityAddress(pub)) {
          setProgressAttempts(attempts);
          const importRes = await fetch("/api/admin/vanity/import", {
            method: "POST",
            headers: { "content-type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ suffix: "AMP", secretKey: Array.from(kp.secretKey) }),
          });
          const importJson = await readJsonSafe(importRes);
          if (!importRes.ok) throw new Error(importJson?.error ?? `Import failed (${importRes.status})`);

          const pk = String(importJson?.publicKey ?? kp.publicKey.toBase58()).trim();
          const duration = Date.now() - start;
          setResults((prev) => [{ publicKey: pk, duration, attempts }, ...prev].slice(0, 20));
          return;
        }
      }

      setProgressAttempts(attempts);
      await new Promise((r) => setTimeout(r, 0));
    }

    throw new Error(`Failed to find keypair with suffix "${suffixValue}" after ${maxAttempts} attempts`);
  }

  async function generateToTarget() {
    setError(null);
    setBusy("Generating...");
    try {
      if (!sessionWallet) throw new Error("Admin login required");

      setProgressAttempts(0);
      let generated = 0;

      // Keep generating until we reach the target
      while (true) {
        // Refresh pool to get current count
        const sp = new URLSearchParams();
        sp.set("suffix", "AMP");
        const poolRes = await fetch(`/api/admin/vanity/pool?${sp.toString()}`, { cache: "no-store", credentials: "include" });
        const poolJson = await readJsonSafe(poolRes);
        const currentAvailable = Number(poolJson?.availableCount ?? 0);
        
        if (currentAvailable >= TARGET_POOL_SIZE) {
          break;
        }

        const remaining = TARGET_POOL_SIZE - currentAvailable;
        setBusy(`Generating ${generated + 1}/${remaining + generated} to reach ${TARGET_POOL_SIZE}... (${progressAttempts.toLocaleString()} attempts)`);
        await generateVanityOnce();
        generated++;
      }

      await refreshPool();
      toast({ kind: "success", message: `Generated ${generated} vanity mint(s) - pool now at target (${TARGET_POOL_SIZE})` });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="utilityPage" style={{ position: "relative", minHeight: "100vh" }}>
      {/* DVD Bouncing Text - only show when not logged in */}
      {!sessionWallet && <DVDBouncingText />}

      <div className="utilityWrap" style={{ position: "relative", zIndex: 1 }}>
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

        {/* Only show admin tools when logged in */}
        {sessionWallet && (
        <div className="utilityCard" style={{ marginTop: 24 }}>
          <div className="utilityCardHeader">
            <h2 className="utilityCardTitle">Vanity Mint Pool</h2>
            <p className="utilityCardSub">Generate vanity mints ahead of time so launches can stay fast.</p>
          </div>
          <div className="utilityCardBody">
            <div style={{ 
              display: "flex", 
              alignItems: "center", 
              gap: 16, 
              padding: "16px 20px", 
              background: "rgba(182, 240, 74, 0.05)", 
              borderRadius: 12,
              border: "1px solid rgba(182, 240, 74, 0.2)"
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Generate to Target ({TARGET_POOL_SIZE})</div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
                  {pool ? `Currently ${pool.availableCount} available` : "Loading..."} 
                  {pool && pool.availableCount < TARGET_POOL_SIZE && ` — needs ${TARGET_POOL_SIZE - pool.availableCount} more`}
                  {pool && pool.availableCount >= TARGET_POOL_SIZE && " — pool is full!"}
                </div>
              </div>
              <button 
                className="utilityBtn utilityBtnPrimary" 
                onClick={() => generateToTarget().catch(() => null)} 
                disabled={!!busy || !sessionWallet || (pool?.availableCount ?? 0) >= TARGET_POOL_SIZE}
                style={{ minWidth: 180 }}
              >
                {busy?.startsWith("Generating") ? busy : "Generate to Target"}
              </button>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
              <button className="utilityBtn" onClick={() => refreshPool().catch(() => null)} disabled={!!busy || !sessionWallet}>
                Refresh pool status
              </button>
              <button 
                className="utilityBtn" 
                onClick={() => cleanupInvalidVanity()} 
                disabled={!!busy || !sessionWallet}
                style={{ background: "rgba(239, 68, 68, 0.2)", borderColor: "rgba(239, 68, 68, 0.4)" }}
              >
                Cleanup invalid addresses
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

            {pool?.upcomingAddresses?.length ? (
              <div className="utilitySection" style={{ marginTop: 24 }}>
                <h3 className="utilitySectionTitle" style={{ marginBottom: 12 }}>
                  Upcoming Contract Addresses (Next in Queue)
                </h3>
                <div style={{ 
                  background: "rgba(182, 240, 74, 0.05)", 
                  border: "1px solid rgba(182, 240, 74, 0.2)", 
                  borderRadius: 12, 
                  padding: 16 
                }}>
                  <div style={{ marginBottom: 12, fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
                    The first address will be used for the next launch. Copy it now for early marketing.
                  </div>
                  <div className="utilityList" style={{ gap: 8 }}>
                    {pool.upcomingAddresses.map((addr) => (
                      <div 
                        key={addr.publicKey} 
                        className="utilityListItem"
                        style={{
                          background: addr.position === 1 ? "rgba(182, 240, 74, 0.1)" : "rgba(255,255,255,0.03)",
                          border: addr.position === 1 ? "1px solid rgba(182, 240, 74, 0.3)" : "1px solid rgba(255,255,255,0.1)",
                          borderRadius: 8,
                          padding: "12px 16px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 12
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
                          <div style={{
                            width: 28,
                            height: 28,
                            borderRadius: 6,
                            background: addr.position === 1 ? "rgba(182, 240, 74, 0.2)" : "rgba(255,255,255,0.1)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 12,
                            fontWeight: 700,
                            color: addr.position === 1 ? "#B6F04A" : "rgba(255,255,255,0.5)",
                            flexShrink: 0
                          }}>
                            {addr.position === 1 ? "▶" : addr.position}
                          </div>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ 
                              fontFamily: "monospace", 
                              fontSize: 13, 
                              color: addr.position === 1 ? "#B6F04A" : "white",
                              fontWeight: addr.position === 1 ? 600 : 400,
                              wordBreak: "break-all"
                            }}>
                              {addr.publicKey}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(addr.publicKey);
                            toast({ kind: "success", message: "Copied to clipboard!" });
                          }}
                          style={{
                            padding: "6px 12px",
                            borderRadius: 6,
                            background: addr.position === 1 ? "#B6F04A" : "rgba(255,255,255,0.1)",
                            color: addr.position === 1 ? "#000" : "white",
                            fontSize: 12,
                            fontWeight: 600,
                            border: "none",
                            cursor: "pointer",
                            flexShrink: 0
                          }}
                        >
                          Copy
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

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
        )}
      </div>
    </main>
  );
}

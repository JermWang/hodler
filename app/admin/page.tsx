"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import bs58 from "bs58";

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
        Admin access required
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
  targetPoolSize: number;
  upcomingAddresses?: Array<{
    position: number;
    publicKey: string;
    createdAt: number;
  }>;
};

type LaunchEligibilityResult = {
  eligible: boolean;
  reason?: string;
  message?: string;
  existingCommitmentId?: string;
  existingTokenMint?: string | null;
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
  const [launchEligibility, setLaunchEligibility] = useState<LaunchEligibilityResult | null>(null);

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Refund treasury state
  const [refundPayerWallet, setRefundPayerWallet] = useState("");
  const [refundWalletId, setRefundWalletId] = useState("");
  const [refundDestination, setRefundDestination] = useState("");
  const [refundResult, setRefundResult] = useState<{ ok: boolean; message?: string; signature?: string; error?: string } | null>(null);

  // Add token state
  const [addTokenMint, setAddTokenMint] = useState("");
  const [addTokenCreatorWallet, setAddTokenCreatorWallet] = useState("");
  const [addTokenPrivyWalletId, setAddTokenPrivyWalletId] = useState("");
  const [addTokenName, setAddTokenName] = useState("");
  const [addTokenResult, setAddTokenResult] = useState<{ ok: boolean; message?: string; error?: string } | null>(null);

  // Restore token state
  const [restoreTokenMint, setRestoreTokenMint] = useState("");
  const [restoreResult, setRestoreResult] = useState<{ ok: boolean; message?: string; error?: string } | null>(null);

  const [archiveTokenMint, setArchiveTokenMint] = useState("");
  const [archiveResult, setArchiveResult] = useState<{ ok: boolean; message?: string; error?: string } | null>(null);

  // Claim escrow funds state
  type ClaimableCampaign = {
    id: string;
    name: string;
    tokenMint: string;
    status: string;
    escrowPubkey: string | null;
    escrowBalanceLamports: number;
    escrowBalanceSol: number;
    activeParticipants: number;
    canClaim: boolean;
  };
  const [claimableCampaigns, setClaimableCampaigns] = useState<ClaimableCampaign[]>([]);
  const [claimResult, setClaimResult] = useState<{ ok: boolean; message?: string; signature?: string; error?: string } | null>(null);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);

  // Target pool size comes from API (env: VANITY_WORKER_TARGET_AVAILABLE)
  const targetPoolSize = pool?.targetPoolSize ?? 50;

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

  async function archiveToken() {
    if (!archiveTokenMint.trim()) {
      setArchiveResult({ ok: false, error: "Token mint is required" });
      return;
    }
    if (!confirm(`This will archive the launch and cancel campaigns for token mint:\n${archiveTokenMint.trim()}\n\nContinue?`)) {
      return;
    }
    setError(null);
    setArchiveResult(null);
    setBusy("Archiving token...");
    try {
      const res = await fetch("/api/admin/archive-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokenMint: archiveTokenMint.trim() }),
        credentials: "include",
      });
      const json = await readJsonSafe(res);
      if (!res.ok) throw new Error(json?.error ?? `Archive failed (${res.status})`);
      setArchiveResult({ ok: true, message: json.message });
      toast({ kind: "success", message: json.message || "Token archived" });
    } catch (e) {
      setArchiveResult({ ok: false, error: (e as Error).message });
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function generateToTarget() {
    setBusy("Generating vanity addresses to target...");
    setError(null);
    try {
      const res = await fetch("/api/admin/vanity/pool", {
        method: "PUT",
        credentials: "include",
      });
      const json = await readJsonSafe(res);
      if (!res.ok) throw new Error(json?.error ?? `Generation failed (${res.status})`);
      await refreshPool();
      toast({ 
        kind: "success", 
        message: json.message || `Generated ${json.generated} addresses` 
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

  async function clearLaunchHistory() {
    if (!sessionWallet) return;
    if (!confirm(`This will archive ALL active campaigns for wallet:\n${sessionWallet}\n\nThis will allow the wallet to launch again. Continue?`)) {
      return;
    }
    setError(null);
    setBusy("Clearing launch history...");
    try {
      const res = await fetch("/api/admin/clear-launch-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletPubkey: sessionWallet }),
        credentials: "include",
      });
      const json = await readJsonSafe(res);
      if (!res.ok) throw new Error(json?.error ?? `Clear failed (${res.status})`);
      toast({ kind: "success", message: json.message || `Archived ${json.archivedCount} campaigns` });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function checkLaunchEligibility() {
    if (!sessionWallet) return;
    setError(null);
    setBusy("Checking launch eligibility...");
    try {
      const res = await fetch("/api/launch/eligibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletPubkey: sessionWallet }),
      });
      const json = await readJsonSafe(res);
      if (!res.ok) throw new Error(json?.error ?? `Eligibility check failed (${res.status})`);
      setLaunchEligibility(json as LaunchEligibilityResult);
      if ((json as LaunchEligibilityResult).eligible) {
        toast({ kind: "success", message: "Eligible to launch." });
      } else {
        toast({ kind: "error", message: "Not eligible to launch." });
      }
    } catch (e) {
      setLaunchEligibility(null);
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function addTokenToSystem() {
    if (!addTokenMint.trim() || !addTokenCreatorWallet.trim() || !addTokenPrivyWalletId.trim()) {
      setAddTokenResult({ ok: false, error: "Token mint, creator wallet, and Privy wallet ID are required" });
      return;
    }
    setError(null);
    setAddTokenResult(null);
    setBusy("Adding token...");
    try {
      const res = await fetch("/api/admin/add-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenMint: addTokenMint.trim(),
          creatorWallet: addTokenCreatorWallet.trim(),
          privyWalletId: addTokenPrivyWalletId.trim(),
          name: addTokenName.trim() || undefined,
        }),
        credentials: "include",
      });
      const json = await readJsonSafe(res);
      if (!res.ok) throw new Error(json?.error ?? `Add failed (${res.status})`);
      setAddTokenResult({ ok: true, message: json.message });
      toast({ kind: "success", message: json.message || "Token added successfully" });
    } catch (e) {
      setAddTokenResult({ ok: false, error: (e as Error).message });
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function restoreToken() {
    if (!restoreTokenMint.trim()) {
      setRestoreResult({ ok: false, error: "Token mint is required" });
      return;
    }
    setError(null);
    setRestoreResult(null);
    setBusy("Restoring token...");
    try {
      const res = await fetch("/api/admin/restore-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokenMint: restoreTokenMint.trim() }),
        credentials: "include",
      });
      const json = await readJsonSafe(res);
      if (!res.ok) throw new Error(json?.error ?? `Restore failed (${res.status})`);
      setRestoreResult({ ok: true, message: json.message });
      toast({ kind: "success", message: json.message || "Token restored successfully" });
    } catch (e) {
      setRestoreResult({ ok: false, error: (e as Error).message });
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function loadClaimableCampaigns() {
    setLoadingCampaigns(true);
    setClaimResult(null);
    try {
      const res = await fetch("/api/admin/claim-escrow-funds", {
        cache: "no-store",
        credentials: "include",
      });
      const json = await readJsonSafe(res);
      if (!res.ok) {
        const msg = String(json?.error ?? `Request failed (${res.status})`).trim();
        const raw = String(json?.rawError ?? "").trim();
        throw new Error(raw ? `${msg}: ${raw}` : msg);
      }
      setClaimableCampaigns(json.campaigns || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingCampaigns(false);
    }
  }

  async function claimEscrowFunds(campaignId: string, campaignName: string, solAmount: number) {
    if (!confirm(`This will claim ${solAmount.toFixed(4)} SOL from campaign "${campaignName}" escrow to your admin wallet.\n\nThis action cannot be undone. Continue?`)) {
      return;
    }
    setError(null);
    setClaimResult(null);
    setBusy("Claiming escrow funds...");
    try {
      const res = await fetch("/api/admin/claim-escrow-funds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId }),
        credentials: "include",
      });
      const json = await readJsonSafe(res);
      if (!res.ok) {
        const msg = String(json?.error ?? `Claim failed (${res.status})`).trim();
        const raw = String(json?.rawError ?? "").trim();
        throw new Error(raw ? `${msg}: ${raw}` : msg);
      }
      setClaimResult({ ok: true, message: json.message, signature: json.signature });
      toast({ kind: "success", message: json.message || "Funds claimed successfully" });
      // Refresh the list
      await loadClaimableCampaigns();
    } catch (e) {
      setClaimResult({ ok: false, error: (e as Error).message });
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function claimAllEscrowFunds() {
    const claimable = claimableCampaigns.filter(c => c.canClaim);
    if (claimable.length === 0) {
      toast({ kind: "error", message: "No campaigns with claimable funds" });
      return;
    }
    const totalSol = claimable.reduce((sum, c) => sum + c.escrowBalanceSol, 0);
    if (!confirm(`This will claim ${totalSol.toFixed(4)} SOL total from ${claimable.length} campaign(s) to your admin wallet.\n\nThis action cannot be undone. Continue?`)) {
      return;
    }
    setError(null);
    setClaimResult(null);
    setBusy("Claiming all escrow funds...");
    try {
      let claimed = 0;
      let totalClaimed = 0;
      let lastError: string | null = null;
      for (const campaign of claimable) {
        const res = await fetch("/api/admin/claim-escrow-funds", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ campaignId: campaign.id }),
          credentials: "include",
        });
        const json = await readJsonSafe(res);
        if (res.ok) {
          claimed++;
          totalClaimed += json.transferLamports / 1e9;
        } else {
          const msg = String(json?.error ?? `Claim failed (${res.status})`).trim();
          const raw = String(json?.rawError ?? "").trim();
          lastError = raw ? `${msg}: ${raw}` : msg;
        }
      }
      if (lastError) setError(lastError);
      setClaimResult({ ok: true, message: `Claimed ${totalClaimed.toFixed(4)} SOL from ${claimed} campaign(s)` });
      toast({ kind: "success", message: `Claimed ${totalClaimed.toFixed(4)} SOL from ${claimed} campaign(s)` });
      await loadClaimableCampaigns();
    } catch (e) {
      setClaimResult({ ok: false, error: (e as Error).message });
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function refundTreasury() {
    const payerWallet = refundPayerWallet.trim();
    const walletId = refundWalletId.trim();
    const destinationWallet = refundDestination.trim();

    if ((!payerWallet && !walletId) || !destinationWallet) {
      setRefundResult({ ok: false, error: "Destination wallet is required, and you must provide either payer wallet or wallet ID" });
      return;
    }

    const confirmLabel = payerWallet ? `payer wallet:\n${payerWallet}` : `treasury wallet ID:\n${walletId}`;
    if (!confirm(`This will refund ALL SOL from ${confirmLabel}\n\nTo destination:\n${destinationWallet}\n\nContinue?`)) {
      return;
    }
    setError(null);
    setRefundResult(null);
    setBusy("Refunding treasury...");
    try {
      const usePayerWallet = Boolean(payerWallet);
      const res = await fetch(usePayerWallet ? "/api/admin/refund-treasury-by-payer" : "/api/admin/refund-treasury", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          usePayerWallet
            ? { payerWallet, destinationWallet }
            : { walletId, destinationWallet }
        ),
        credentials: "include",
      });
      const json = await readJsonSafe(res);
      if (!res.ok) {
        const msg = String(json?.error ?? `Refund failed (${res.status})`).trim();
        const raw = String(json?.rawError ?? "").trim();
        throw new Error(raw ? `${msg}: ${raw}` : msg);
      }
      setRefundResult({ ok: true, message: json.message, signature: json.signature });
      toast({ kind: "success", message: json.message || "Refund successful" });
    } catch (e) {
      setRefundResult({ ok: false, error: (e as Error).message });
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
        <>
        <div className="utilityCard" style={{ marginTop: 24 }}>
          <div className="utilityCardHeader">
            <h2 className="utilityCardTitle">Launch Management</h2>
            <p className="utilityCardSub">Check eligibility or clear launch history to allow your wallet to launch again.</p>
          </div>
          <div className="utilityCardBody">
            <div style={{ 
              display: "flex",
              alignItems: "center",
              gap: 16,
              padding: "16px 20px", 
              background: "rgba(239, 68, 68, 0.1)", 
              borderRadius: 12,
              border: "1px solid rgba(239, 68, 68, 0.3)"
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, marginBottom: 4, color: "#ef4444" }}>
                  Clear Launch History
                </div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
                  Archives all active campaigns for your admin wallet, allowing you to launch again.
                </div>
              </div>
              <button 
                className="utilityBtn" 
                onClick={() => clearLaunchHistory()} 
                disabled={!!busy || !sessionWallet}
                style={{ 
                  minWidth: 160,
                  background: "rgba(239, 68, 68, 0.2)", 
                  borderColor: "rgba(239, 68, 68, 0.4)",
                  color: "#ef4444"
                }}
              >
                {busy?.includes("Clearing") ? "Clearing..." : "Clear History"}
              </button>
            </div>

            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              padding: "16px 20px",
              background: launchEligibility
                ? (launchEligibility.eligible ? "rgba(182, 240, 74, 0.1)" : "rgba(239, 68, 68, 0.1)")
                : "rgba(59, 130, 246, 0.1)",
              borderRadius: 12,
              border: launchEligibility
                ? (launchEligibility.eligible ? "1px solid rgba(182, 240, 74, 0.3)" : "1px solid rgba(239, 68, 68, 0.3)")
                : "1px solid rgba(59, 130, 246, 0.3)",
              marginTop: 14,
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                  Launch Eligibility Check
                </div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
                  {launchEligibility
                    ? (launchEligibility.eligible
                      ? "Eligible to launch."
                      : (launchEligibility.message || "Not eligible to launch."))
                    : "Run a quick check for the logged-in admin wallet."}
                </div>
                {!launchEligibility?.eligible && launchEligibility?.existingTokenMint ? (
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 6 }}>
                    Existing token mint: {launchEligibility.existingTokenMint}
                  </div>
                ) : null}
                {!launchEligibility?.eligible && launchEligibility?.existingCommitmentId ? (
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
                    Existing record: {launchEligibility.existingCommitmentId}
                  </div>
                ) : null}
              </div>
              <button
                className="utilityBtn utilityBtnPrimary"
                onClick={() => checkLaunchEligibility().catch(() => null)}
                disabled={!!busy || !sessionWallet}
                style={{ minWidth: 160 }}
              >
                {busy?.includes("Checking") ? "Checking..." : "Check Eligibility"}
              </button>
            </div>
          </div>
        </div>

        <div className="utilityCard" style={{ marginTop: 24 }}>
          <div className="utilityCardHeader">
            <h2 className="utilityCardTitle">Claim Campaign Escrow Funds</h2>
            <p className="utilityCardSub">Recover SOL from campaign escrow wallets with no active participants.</p>
          </div>
          <div className="utilityCardBody">
            <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
              <button
                className="utilityBtn utilityBtnPrimary"
                onClick={() => loadClaimableCampaigns()}
                disabled={!!busy || loadingCampaigns}
              >
                {loadingCampaigns ? "Loading..." : "Load Campaigns"}
              </button>
              {claimableCampaigns.filter(c => c.canClaim).length > 0 && (
                <button
                  className="utilityBtn"
                  onClick={() => claimAllEscrowFunds()}
                  disabled={!!busy}
                  style={{
                    background: "rgba(182, 240, 74, 0.2)",
                    borderColor: "rgba(182, 240, 74, 0.4)",
                    color: "#b6f04a",
                  }}
                >
                  Claim All ({claimableCampaigns.filter(c => c.canClaim).reduce((sum, c) => sum + c.escrowBalanceSol, 0).toFixed(4)} SOL)
                </button>
              )}
            </div>

            {claimResult && (
              <div style={{
                marginBottom: 16,
                padding: "12px 16px",
                background: claimResult.ok ? "rgba(182, 240, 74, 0.1)" : "rgba(239, 68, 68, 0.1)",
                border: claimResult.ok ? "1px solid rgba(182, 240, 74, 0.3)" : "1px solid rgba(239, 68, 68, 0.3)",
                borderRadius: 8,
                fontSize: 13,
              }}>
                {claimResult.ok ? (
                  <>
                    <div style={{ fontWeight: 600, color: "#b6f04a" }}>{claimResult.message}</div>
                    {claimResult.signature && (
                      <a
                        href={`https://solscan.io/tx/${claimResult.signature}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "#60a5fa", textDecoration: "underline", fontSize: 12, marginTop: 4, display: "inline-block" }}
                      >
                        View on Solscan
                      </a>
                    )}
                  </>
                ) : (
                  <div style={{ color: "#ef4444" }}>{claimResult.error}</div>
                )}
              </div>
            )}

            {claimableCampaigns.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {claimableCampaigns.map((campaign) => (
                  <div
                    key={campaign.id}
                    style={{
                      padding: "12px 16px",
                      background: campaign.canClaim ? "rgba(182, 240, 74, 0.05)" : "rgba(255,255,255,0.03)",
                      border: campaign.canClaim ? "1px solid rgba(182, 240, 74, 0.2)" : "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 8,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>{campaign.name || "Unnamed Campaign"}</div>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", fontFamily: "monospace" }}>
                        {campaign.tokenMint?.slice(0, 8)}...{campaign.tokenMint?.slice(-4)}
                      </div>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
                        Status: {campaign.status} | Participants: {campaign.activeParticipants} | Balance: {campaign.escrowBalanceSol.toFixed(4)} SOL
                      </div>
                    </div>
                    <button
                      className="utilityBtn"
                      onClick={() => claimEscrowFunds(campaign.id, campaign.name, campaign.escrowBalanceSol)}
                      disabled={!campaign.canClaim || !!busy}
                      style={{
                        minWidth: 100,
                        background: campaign.canClaim ? "rgba(182, 240, 74, 0.2)" : "rgba(255,255,255,0.05)",
                        borderColor: campaign.canClaim ? "rgba(182, 240, 74, 0.4)" : "rgba(255,255,255,0.1)",
                        color: campaign.canClaim ? "#b6f04a" : "rgba(255,255,255,0.3)",
                      }}
                    >
                      {campaign.canClaim ? "Claim" : campaign.activeParticipants > 0 ? "Has Users" : "No Funds"}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
                Click &quot;Load Campaigns&quot; to see campaigns with escrow wallets.
              </div>
            )}
          </div>
        </div>

        <div className="utilityCard" style={{ marginTop: 24 }}>
          <div className="utilityCardHeader">
            <h2 className="utilityCardTitle">Refund Treasury</h2>
            <p className="utilityCardSub">Recover SOL from a Privy treasury wallet after a failed launch.</p>
          </div>
          <div className="utilityCardBody">
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", marginBottom: 4, display: "block" }}>
                  Payer Wallet (recommended)
                </label>
                <input
                  type="text"
                  value={refundPayerWallet}
                  onChange={(e) => setRefundPayerWallet(e.target.value)}
                  placeholder="3WfKw8HJENLS42DEdVHvh7LoXMSC6Uuay4BcF9akzYjy"
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    background: "rgba(0,0,0,0.3)",
                    border: "1px solid rgba(255,255,255,0.2)",
                    borderRadius: 8,
                    color: "#fff",
                    fontSize: 14,
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", marginBottom: 4, display: "block" }}>
                  Privy Wallet ID (e.g. wjcernj4gbe5fzg3nu5vwg7m)
                </label>
                <input
                  type="text"
                  value={refundWalletId}
                  onChange={(e) => setRefundWalletId(e.target.value)}
                  placeholder="wjcernj4gbe5fzg3nu5vwg7m"
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    background: "rgba(0,0,0,0.3)",
                    border: "1px solid rgba(255,255,255,0.2)",
                    borderRadius: 8,
                    color: "#fff",
                    fontSize: 14,
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", marginBottom: 4, display: "block" }}>
                  Destination Wallet (where to send the SOL)
                </label>
                <input
                  type="text"
                  value={refundDestination}
                  onChange={(e) => setRefundDestination(e.target.value)}
                  placeholder="3WfKw8HJENLS42DEdVHvh7LoXMSC6Uuay4BcF9akzYjy"
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    background: "rgba(0,0,0,0.3)",
                    border: "1px solid rgba(255,255,255,0.2)",
                    borderRadius: 8,
                    color: "#fff",
                    fontSize: 14,
                  }}
                />
              </div>
              <button
                className="utilityBtn"
                onClick={() => refundTreasury()}
                disabled={!!busy || !sessionWallet || !refundDestination.trim() || (!refundWalletId.trim() && !refundPayerWallet.trim())}
                style={{
                  marginTop: 8,
                  background: "rgba(239, 68, 68, 0.2)",
                  borderColor: "rgba(239, 68, 68, 0.4)",
                  color: "#ef4444",
                }}
              >
                {busy?.includes("Refunding") ? "Refunding..." : "Refund SOL"}
              </button>
              {refundResult && (
                <div style={{
                  marginTop: 8,
                  padding: "12px 16px",
                  background: refundResult.ok ? "rgba(182, 240, 74, 0.1)" : "rgba(239, 68, 68, 0.1)",
                  border: refundResult.ok ? "1px solid rgba(182, 240, 74, 0.3)" : "1px solid rgba(239, 68, 68, 0.3)",
                  borderRadius: 8,
                  fontSize: 13,
                }}>
                  {refundResult.ok ? (
                    <>
                      <div style={{ fontWeight: 600, color: "#b6f04a" }}>{refundResult.message}</div>
                      {refundResult.signature && (
                        <a
                          href={`https://solscan.io/tx/${refundResult.signature}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: "#60a5fa", textDecoration: "underline", fontSize: 12, marginTop: 4, display: "inline-block" }}
                        >
                          View on Solscan
                        </a>
                      )}
                    </>
                  ) : (
                    <div style={{ color: "#ef4444" }}>{refundResult.error}</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="utilityCard" style={{ marginTop: 24 }}>
          <div className="utilityCardHeader">
            <h2 className="utilityCardTitle">Add Existing Token</h2>
            <p className="utilityCardSub">Add a previously launched token back to the discover page and campaign system.</p>
          </div>
          <div className="utilityCardBody">
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", marginBottom: 4, display: "block" }}>
                  Token Mint Address
                </label>
                <input
                  type="text"
                  value={addTokenMint}
                  onChange={(e) => setAddTokenMint(e.target.value)}
                  placeholder="32WSWCU1Z6kGDUmzHW8WyNadoMg5hMjniMnAK4YVsAMP"
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    background: "rgba(0,0,0,0.3)",
                    border: "1px solid rgba(255,255,255,0.2)",
                    borderRadius: 8,
                    color: "#fff",
                    fontSize: 14,
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", marginBottom: 4, display: "block" }}>
                  Creator Wallet (for fee claims)
                </label>
                <input
                  type="text"
                  value={addTokenCreatorWallet}
                  onChange={(e) => setAddTokenCreatorWallet(e.target.value)}
                  placeholder="DuubGNbJxTgGxhMJeBngjMqMh4SgmXUV5hi8F6VAB3vH"
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    background: "rgba(0,0,0,0.3)",
                    border: "1px solid rgba(255,255,255,0.2)",
                    borderRadius: 8,
                    color: "#fff",
                    fontSize: 14,
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", marginBottom: 4, display: "block" }}>
                  Privy Wallet ID (treasury wallet)
                </label>
                <input
                  type="text"
                  value={addTokenPrivyWalletId}
                  onChange={(e) => setAddTokenPrivyWalletId(e.target.value)}
                  placeholder="wjcernj4gbe5fzg3nu5vwg7m"
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    background: "rgba(0,0,0,0.3)",
                    border: "1px solid rgba(255,255,255,0.2)",
                    borderRadius: 8,
                    color: "#fff",
                    fontSize: 14,
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", marginBottom: 4, display: "block" }}>
                  Token Name (optional)
                </label>
                <input
                  type="text"
                  value={addTokenName}
                  onChange={(e) => setAddTokenName(e.target.value)}
                  placeholder="AmpliFi"
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    background: "rgba(0,0,0,0.3)",
                    border: "1px solid rgba(255,255,255,0.2)",
                    borderRadius: 8,
                    color: "#fff",
                    fontSize: 14,
                  }}
                />
              </div>
              <button
                className="utilityBtn utilityBtnPrimary"
                onClick={() => addTokenToSystem()}
                disabled={!!busy || !sessionWallet || !addTokenMint.trim() || !addTokenCreatorWallet.trim() || !addTokenPrivyWalletId.trim()}
                style={{ marginTop: 8 }}
              >
                {busy?.includes("Adding") ? "Adding..." : "Add Token to System"}
              </button>
              {addTokenResult && (
                <div style={{
                  marginTop: 8,
                  padding: "12px 16px",
                  background: addTokenResult.ok ? "rgba(182, 240, 74, 0.1)" : "rgba(239, 68, 68, 0.1)",
                  border: addTokenResult.ok ? "1px solid rgba(182, 240, 74, 0.3)" : "1px solid rgba(239, 68, 68, 0.3)",
                  borderRadius: 8,
                  fontSize: 13,
                }}>
                  {addTokenResult.ok ? (
                    <div style={{ fontWeight: 600, color: "#b6f04a" }}>{addTokenResult.message}</div>
                  ) : (
                    <div style={{ color: "#ef4444" }}>{addTokenResult.error}</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="utilityCard" style={{ marginTop: 24 }}>
          <div className="utilityCardHeader">
            <h2 className="utilityCardTitle">Restore Archived Token</h2>
            <p className="utilityCardSub">Restore a token that was previously archived via Clear Launch History.</p>
          </div>
          <div className="utilityCardBody">
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", marginBottom: 4, display: "block" }}>
                  Token Mint Address
                </label>
                <input
                  type="text"
                  value={restoreTokenMint}
                  onChange={(e) => setRestoreTokenMint(e.target.value)}
                  placeholder="32WSWCU1Z6kGDUmzHW8WyNadoMg5hMjniMnAK4YVsAMP"
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    background: "rgba(0,0,0,0.3)",
                    border: "1px solid rgba(255,255,255,0.2)",
                    borderRadius: 8,
                    color: "#fff",
                    fontSize: 14,
                  }}
                />
              </div>
              <button
                className="utilityBtn utilityBtnPrimary"
                onClick={() => restoreToken()}
                disabled={!!busy || !sessionWallet || !restoreTokenMint.trim()}
                style={{ marginTop: 8 }}
              >
                {busy?.includes("Restoring") ? "Restoring..." : "Restore Token"}
              </button>
              {restoreResult && (
                <div style={{
                  marginTop: 8,
                  padding: "12px 16px",
                  background: restoreResult.ok ? "rgba(182, 240, 74, 0.1)" : "rgba(239, 68, 68, 0.1)",
                  border: restoreResult.ok ? "1px solid rgba(182, 240, 74, 0.3)" : "1px solid rgba(239, 68, 68, 0.3)",
                  borderRadius: 8,
                  fontSize: 13,
                }}>
                  {restoreResult.ok ? (
                    <div style={{ fontWeight: 600, color: "#b6f04a" }}>{restoreResult.message}</div>
                  ) : (
                    <div style={{ color: "#ef4444" }}>{restoreResult.error}</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="utilityCard" style={{ marginTop: 24 }}>
          <div className="utilityCardHeader">
            <h2 className="utilityCardTitle">Archive Launch by Token Mint</h2>
            <p className="utilityCardSub">Hide a launch from Discover by archiving its commitment record.</p>
          </div>
          <div className="utilityCardBody">
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", marginBottom: 4, display: "block" }}>
                  Token Mint Address
                </label>
                <input
                  type="text"
                  value={archiveTokenMint}
                  onChange={(e) => setArchiveTokenMint(e.target.value)}
                  placeholder="FGuvZLoLnuAo5kjhSFiMSCcorBs6PMuNGjfx2v3dfAMP"
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    background: "rgba(0,0,0,0.3)",
                    border: "1px solid rgba(255,255,255,0.2)",
                    borderRadius: 8,
                    color: "#fff",
                    fontSize: 14,
                  }}
                />
              </div>
              <button
                className="utilityBtn"
                onClick={() => archiveToken()}
                disabled={!!busy || !sessionWallet || !archiveTokenMint.trim()}
                style={{
                  marginTop: 8,
                  background: "rgba(239, 68, 68, 0.2)",
                  borderColor: "rgba(239, 68, 68, 0.4)",
                  color: "#ef4444",
                }}
              >
                {busy?.includes("Archiving") ? "Archiving..." : "Archive Launch"}
              </button>
              {archiveResult && (
                <div
                  style={{
                    marginTop: 8,
                    padding: "12px 16px",
                    background: archiveResult.ok ? "rgba(182, 240, 74, 0.1)" : "rgba(239, 68, 68, 0.1)",
                    border: archiveResult.ok ? "1px solid rgba(182, 240, 74, 0.3)" : "1px solid rgba(239, 68, 68, 0.3)",
                    borderRadius: 8,
                    fontSize: 13,
                  }}
                >
                  {archiveResult.ok ? (
                    <div style={{ fontWeight: 600, color: "#b6f04a" }}>{archiveResult.message}</div>
                  ) : (
                    <div style={{ color: "#ef4444" }}>{archiveResult.error}</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

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
              background: pool && pool.availableCount >= targetPoolSize 
                ? "rgba(182, 240, 74, 0.1)" 
                : "rgba(59, 130, 246, 0.1)", 
              borderRadius: 12,
              border: pool && pool.availableCount >= targetPoolSize 
                ? "1px solid rgba(182, 240, 74, 0.3)" 
                : "1px solid rgba(59, 130, 246, 0.3)"
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                  Pool Target: {targetPoolSize}
                </div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginBottom: 4 }}>
                  {pool ? `Currently ${pool.availableCount} available` : "Loading..."} 
                  {pool && pool.availableCount < targetPoolSize && ` - needs ${targetPoolSize - pool.availableCount} more`}
                  {pool && pool.availableCount >= targetPoolSize && " - pool is full!"}
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
                  Worker auto-generates when below minimum. Use button for manual override.
                </div>
              </div>
              <button 
                className="utilityBtn utilityBtnPrimary" 
                onClick={() => generateToTarget()} 
                disabled={!!busy || !sessionWallet || (pool?.availableCount ?? 0) >= targetPoolSize}
                style={{ minWidth: 160 }}
              >
                {busy?.includes("Generating") ? "Generating..." : "Generate to Target"}
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

          </div>
        </div>
        </>
        )}
      </div>
    </main>
  );
}

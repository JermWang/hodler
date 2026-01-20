"use client";

import { useEffect, useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import bs58 from "bs58";
import { Transaction } from "@solana/web3.js";
import { useToast } from "@/app/components/ToastProvider";

const PUMPFUN_NAME_MAX = 32;
const PUMPFUN_SYMBOL_MAX = 10;
const PUMPFUN_DESCRIPTION_MAX = 600;
const PUMPFUN_ATTRIBUTION = "Launched with AmpliFi";
const PUMPFUN_ATTRIBUTION_DELIM = "\n\n";
const PUMPFUN_DESCRIPTION_BASE_MAX = Math.max(
  0,
  PUMPFUN_DESCRIPTION_MAX - (PUMPFUN_ATTRIBUTION.length + PUMPFUN_ATTRIBUTION_DELIM.length)
);

type LaunchSuccessState = {
  commitmentId: string;
  tokenMint: string;
  launchTxSig: string;
  imageUrl?: string | null;
  name?: string | null;
  symbol?: string | null;
  postLaunchError?: string | null;
};

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function normalizeXUrl(input: string): string {
  const s = String(input ?? "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  const handle = s.replace(/^@/, "");
  return `https://x.com/${handle}`;
}

function normalizeTelegramUrl(input: string): string {
  const s = String(input ?? "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  const cleaned = s.replace(/^@/, "").replace(/^t\.me\//i, "").replace(/^telegram\.me\//i, "");
  return `https://t.me/${cleaned}`;
}

export default function LaunchPage() {
  const { setVisible } = useWalletModal();
  const toast = useToast();
  const { connection } = useConnection();
  const { publicKey, connected, signMessage, sendTransaction } = useWallet();

  const launchCreatorAuthRef = useRef<{ walletPubkey: string; signatureB58: string; timestampUnix: number } | null>(null);
  const pendingUploadRef = useRef<{ file: File; kind: "icon" | "banner" } | null>(null);

  // Mode toggle: new token launch vs existing project lock-up
  const [isExistingProject, setIsExistingProject] = useState(false);

  // Common fields
  const [draftName, setDraftName] = useState("");
  const [draftSymbol, setDraftSymbol] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftImageUrl, setDraftImageUrl] = useState("");
  const [draftWebsiteUrl, setDraftWebsiteUrl] = useState("");
  const [draftXUrl, setDraftXUrl] = useState("");
  const [draftTelegramUrl, setDraftTelegramUrl] = useState("");
  const [draftDiscordUrl, setDraftDiscordUrl] = useState("");

  // New token launch fields
  const [devBuySol, setDevBuySol] = useState("0.1");
  const [useVanity, setUseVanity] = useState(true);

  // Existing project fields
  const [existingTokenMint, setExistingTokenMint] = useState("");
  const [rewardAssetType, setRewardAssetType] = useState<"sol" | "spl">("sol");
  const [trackingHandle, setTrackingHandle] = useState("");
  const [trackingHashtag, setTrackingHashtag] = useState("");
  const [campaignDurationDays, setCampaignDurationDays] = useState("30");

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [launchSuccess, setLaunchSuccess] = useState<LaunchSuccessState | null>(null);
  const [launchProgress, setLaunchProgress] = useState<string | null>(null);

  async function getCreatorAuth(): Promise<{ walletPubkey: string; signatureB58: string; timestampUnix: number }> {
    if (!connected || !publicKey || !signMessage) {
      toast({ kind: "info", message: "Please connect your wallet to continue." });
      setVisible(true);
      throw new Error("Wallet not connected");
    }

    const payerWallet = publicKey.toBase58();
    const cached = launchCreatorAuthRef.current;
    const nowUnix = Math.floor(Date.now() / 1000);
    if (cached && cached.walletPubkey === payerWallet && Math.abs(nowUnix - cached.timestampUnix) < 4 * 60) return cached;

    const timestampUnix = nowUnix;
    const creatorAuthMessage = `AmpliFi\nCreator Auth\nAction: launch_access\nWallet: ${payerWallet}\nTimestamp: ${timestampUnix}`;
    const signatureBytes = await signMessage(new TextEncoder().encode(creatorAuthMessage));
    const next = { walletPubkey: payerWallet, timestampUnix, signatureB58: bs58.encode(signatureBytes) };
    launchCreatorAuthRef.current = next;
    return next;
  }

  async function uploadLaunchAsset(input: { file: File; kind?: "icon" | "banner" }): Promise<void> {
    setError(null);
    try {
      if (!input.file) return;
      if (!connected || !publicKey) {
        pendingUploadRef.current = { file: input.file, kind: input.kind ?? "icon" };
        toast({ kind: "info", message: "Please connect your wallet to upload." });
        setVisible(true);
        return;
      }
      const kind = input.kind ?? "icon";
      setBusy(kind === "banner" ? "upload:banner" : "upload:icon");
      const payerWallet = publicKey.toBase58();

      const infoRes = await fetch("/api/launch/assets/upload-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind,
          contentType: input.file.type || "image/png",
          payerWallet,
        }),
      });
      const infoText = await infoRes.text().catch(() => "");
      const info = (() => {
        try {
          return infoText ? JSON.parse(infoText) : {};
        } catch {
          return {};
        }
      })() as any;
      if (!infoRes.ok) {
        const fallback = infoRes.status === 405 ? "Upload endpoint returned 405 (Method Not Allowed)." : `Upload URL request failed (${infoRes.status})`;
        throw new Error(String(info?.error ?? fallback));
      }

      const signedUrl = String(info?.signedUrl ?? "");
      const publicUrl = String(info?.publicUrl ?? "");
      if (!signedUrl || !publicUrl) throw new Error("Upload URL response missing fields");

      const uploadRes = await fetch(signedUrl, {
        method: "PUT",
        headers: {
          "x-upsert": "true",
          "content-type": input.file.type || "application/octet-stream",
        },
        body: input.file,
      });
      if (!uploadRes.ok) {
        const text = await uploadRes.text().catch(() => "");
        throw new Error(`Upload failed (${uploadRes.status}) ${text}`);
      }

      if (kind === "icon") {
        setDraftImageUrl(publicUrl);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      setError(msg);
      toast({ kind: "error", message: msg });
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    if (!connected || !publicKey) return;
    if (busy != null) return;
    const pending = pendingUploadRef.current;
    if (!pending) return;
    pendingUploadRef.current = null;
    void uploadLaunchAsset({ file: pending.file, kind: pending.kind });
  }, [connected, publicKey, busy]);

  const handleLaunch = async () => {
    setError(null);
    setLaunchSuccess(null);

    if (!connected || !publicKey) {
      toast({ kind: "info", message: "Please connect your wallet to launch." });
      setVisible(true);
      return;
    }

    if (typeof sendTransaction !== "function") {
      toast({ kind: "error", message: "Wallet does not support sending transactions" });
      return;
    }

    const name = draftName.trim();
    const symbol = draftSymbol.trim().replace(/^\$/, "").toUpperCase();
    const imageUrl = String(draftImageUrl ?? "").trim();

    if (!name) return setError("Token name is required");
    if (!symbol) return setError("Token symbol is required");
    if (name.length > PUMPFUN_NAME_MAX) return setError(`Name must be ${PUMPFUN_NAME_MAX} characters or less`);
    if (symbol.length > PUMPFUN_SYMBOL_MAX) return setError(`Symbol must be ${PUMPFUN_SYMBOL_MAX} characters or less`);
    if (!imageUrl) return setError("Token image is required");

    let progressTimer: ReturnType<typeof setInterval> | null = null;
    try {
      setBusy("launch");
      setLaunchProgress("Preparing launch...");
      const payerWallet = publicKey.toBase58();
      let creatorAuth: { walletPubkey: string; signatureB58: string; timestampUnix: number } | null = null;

      const solAmount = parseFloat(String(devBuySol ?? "0")) || 0;
      const initialBuySol = Math.max(0, solAmount);

      const doPrepare = async (auth: typeof creatorAuth) => {
        return await fetch("/api/launch/prepare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payerWallet, devBuySol: initialBuySol, creatorAuth: auth ?? undefined }),
        });
      };

      let prepRes = await doPrepare(null);
      let prepText = await prepRes.text().catch(() => "");
      let prep: any = (() => {
        try {
          return prepText ? JSON.parse(prepText) : {};
        } catch {
          return {};
        }
      })();

      if (!prepRes.ok && (prepRes.status === 401 || prepRes.status === 403) && typeof signMessage === "function") {
        creatorAuth = await getCreatorAuth();
        prepRes = await doPrepare(creatorAuth);
        prepText = await prepRes.text().catch(() => "");
        prep = (() => {
          try {
            return prepText ? JSON.parse(prepText) : {};
          } catch {
            return {};
          }
        })();
      }

      if (!prepRes.ok) {
        setError(prep?.error || `Launch prepare failed (${prepRes.status})`);
        return;
      }

      if (prep?.needsFunding && prep?.txBase64) {
        setLaunchProgress("Waiting for funding transaction signature...");
        const tx = Transaction.from(base64ToBytes(String(prep.txBase64)));
        const sig = await sendTransaction(tx, connection);
        setLaunchProgress("Confirming funding transaction...");
        try {
          if (prep?.blockhash && prep?.lastValidBlockHeight) {
            await connection.confirmTransaction(
              {
                signature: sig,
                blockhash: String(prep.blockhash),
                lastValidBlockHeight: Number(prep.lastValidBlockHeight),
              },
              "confirmed"
            );
          } else {
            await connection.confirmTransaction(sig, "confirmed");
          }
        } catch {
        }
        setLaunchProgress("Funding confirmed. Continuing...");
      }

      const doExecute = async (auth: typeof creatorAuth) => {
        setLaunchProgress(useVanity ? "Launching (generating vanity mint)..." : "Launching...");
        const steps = useVanity
          ? [
              "Uploading token metadata...",
              "Generating vanity mint (can take a while)...",
              "Building launch transaction...",
              "Signing with treasury wallet...",
              "Submitting transaction...",
              "Confirming onchain...",
            ]
          : [
              "Uploading token metadata...",
              "Building launch transaction...",
              "Signing with treasury wallet...",
              "Submitting transaction...",
              "Confirming onchain...",
            ];
        let idx = 0;
        progressTimer = setInterval(() => {
          idx = (idx + 1) % steps.length;
          setLaunchProgress(steps[idx]);
        }, 6500);
        return await fetch("/api/launch/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            walletId: String(prep.walletId ?? ""),
            treasuryWallet: String(prep.treasuryWallet ?? ""),
            creatorWallet: String(prep.treasuryWallet ?? ""),
            payerWallet,
            payoutWallet: payerWallet,
            name,
            symbol,
            description: draftDescription.trim(),
            imageUrl,
            statement: `Launch ${symbol} via AmpliFi`,
            websiteUrl: draftWebsiteUrl.trim(),
            xUrl: normalizeXUrl(draftXUrl),
            telegramUrl: normalizeTelegramUrl(draftTelegramUrl),
            discordUrl: draftDiscordUrl.trim(),
            devBuySol: initialBuySol,
            useVanity,
            vanitySuffix: useVanity ? "pump" : "",
            creatorAuth: auth ?? undefined,
          }),
        });
      };

      const fundTreasuryFromExecute = async (exec: any) => {
        if (!exec?.needsFunding || !exec?.txBase64) return "";
        setLaunchProgress("Treasury needs funding. Please approve the transfer...");
        const tx = Transaction.from(base64ToBytes(String(exec.txBase64)));
        const sig = await sendTransaction(tx, connection);
        setLaunchProgress("Confirming treasury funding...");
        try {
          if (exec?.blockhash && exec?.lastValidBlockHeight) {
            await connection.confirmTransaction(
              {
                signature: sig,
                blockhash: String(exec.blockhash),
                lastValidBlockHeight: Number(exec.lastValidBlockHeight),
              },
              "confirmed"
            );
          } else {
            await connection.confirmTransaction(sig, "confirmed");
          }
        } catch {
        }
        return sig;
      };

      let execRes = await doExecute(creatorAuth);
      let execText = await execRes.text().catch(() => "");
      let exec: any = (() => {
        try {
          return execText ? JSON.parse(execText) : {};
        } catch {
          return {};
        }
      })();

      // Some cases only become apparent during execute (e.g. underfunded treasury).
      // If execute asks for funding, do it and retry once.
      if (execRes.ok && exec?.needsFunding && exec?.txBase64) {
        const sig = await fundTreasuryFromExecute(exec);
        setLaunchProgress("Treasury funded. Retrying launch...");

        const doExecuteWithFundSig = async (auth: typeof creatorAuth) => {
          return await fetch("/api/launch/execute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              walletId: String(prep.walletId ?? ""),
              treasuryWallet: String(prep.treasuryWallet ?? ""),
              creatorWallet: String(prep.treasuryWallet ?? ""),
              payerWallet,
              payoutWallet: payerWallet,
              name,
              symbol,
              description: draftDescription.trim(),
              imageUrl,
              statement: `Launch ${symbol} via AmpliFi`,
              websiteUrl: draftWebsiteUrl.trim(),
              xUrl: normalizeXUrl(draftXUrl),
              telegramUrl: normalizeTelegramUrl(draftTelegramUrl),
              discordUrl: draftDiscordUrl.trim(),
              devBuySol: initialBuySol,
              useVanity,
              vanitySuffix: useVanity ? "pump" : "",
              fundSignature: sig || undefined,
              creatorAuth: auth ?? undefined,
            }),
          });
        };

        execRes = await doExecuteWithFundSig(creatorAuth);
        execText = await execRes.text().catch(() => "");
        exec = (() => {
          try {
            return execText ? JSON.parse(execText) : {};
          } catch {
            return {};
          }
        })();
      }

      if (!execRes.ok && (execRes.status === 401 || execRes.status === 403) && !creatorAuth && typeof signMessage === "function") {
        creatorAuth = await getCreatorAuth();
        execRes = await doExecute(creatorAuth);
        execText = await execRes.text().catch(() => "");
        exec = (() => {
          try {
            return execText ? JSON.parse(execText) : {};
          } catch {
            return {};
          }
        })();
      }

      if (!execRes.ok) {
        const details = exec?.requestId && exec?.stage ? ` (requestId: ${exec.requestId}, stage: ${exec.stage})` : "";
        setError((exec?.error || `Launch failed (${execRes.status})`) + details);
        return;
      }

      setLaunchSuccess({
        commitmentId: String(exec?.commitmentId ?? ""),
        tokenMint: String(exec?.tokenMint ?? ""),
        launchTxSig: String(exec?.launchTxSig ?? ""),
        imageUrl,
        name,
        symbol,
        postLaunchError: exec?.postLaunchError ?? null,
      });
    } catch (err) {
      console.error("Launch error:", err);
      setError(err instanceof Error ? err.message : "Launch failed");
    } finally {
      if (progressTimer) clearInterval(progressTimer);
      setBusy(null);
      setLaunchProgress(null);
    }
  };

  const handleRegisterProject = async () => {
    setError(null);
    setLaunchSuccess(null);

    if (!connected || !publicKey || !signMessage) {
      toast({ kind: "info", message: "Please connect your wallet to register." });
      setVisible(true);
      return;
    }

    const name = draftName.trim();
    const symbol = draftSymbol.trim().replace(/^\$/, "").toUpperCase();
    const tokenMint = existingTokenMint.trim();
    const handle = trackingHandle.trim().replace(/^@/, "");

    if (!tokenMint) return setError("Token contract address is required");
    if (!name) return setError("Project name is required");
    if (!symbol) return setError("Token symbol is required");
    if (!handle) return setError("Tracking handle is required");

    try {
      setBusy("register");
      const walletPubkey = publicKey.toBase58();
      const timestampUnix = Math.floor(Date.now() / 1000);

      // Sign for project registration
      const registerMsg = `AmpliFi\nRegister Project\nToken: ${tokenMint}\nCreator: ${walletPubkey}\nTimestamp: ${timestampUnix}`;
      const registerSigBytes = await signMessage(new TextEncoder().encode(registerMsg));
      const registerSigB58 = bs58.encode(registerSigBytes);

      // Step 1: Register the project
      const registerRes = await fetch("/api/projects/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenMint,
          creatorPubkey: walletPubkey,
          name,
          symbol,
          description: draftDescription.trim() || undefined,
          imageUrl: draftImageUrl.trim() || undefined,
          websiteUrl: draftWebsiteUrl.trim() || undefined,
          twitterHandle: draftXUrl.trim().replace(/^@/, "").replace(/https?:\/\/(x|twitter)\.com\//i, "") || undefined,
          discordUrl: draftDiscordUrl.trim() || undefined,
          telegramUrl: draftTelegramUrl.trim() || undefined,
          signature: registerSigB58,
          timestamp: timestampUnix,
        }),
      });

      const registerData = await registerRes.json();
      if (!registerRes.ok) {
        setError(registerData?.error || "Failed to register project");
        return;
      }

      // Step 2: Create the campaign
      const campaignMsg = `AmpliFi\nCreate Campaign\nProject: ${walletPubkey}\nToken: ${tokenMint}\nTimestamp: ${timestampUnix}`;
      const campaignSigBytes = await signMessage(new TextEncoder().encode(campaignMsg));
      const campaignSigB58 = bs58.encode(campaignSigBytes);

      const durationDays = parseInt(campaignDurationDays, 10) || 30;
      const nowUnix = Math.floor(Date.now() / 1000);
      const startAtUnix = nowUnix;
      const endAtUnix = nowUnix + durationDays * 86400;

      const trackingHandles = handle ? [handle] : [];
      const trackingHashtags = trackingHashtag.trim() ? [trackingHashtag.trim().replace(/^#/, "")] : [];

      const campaignRes = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectPubkey: walletPubkey,
          tokenMint,
          name: `${name} Engagement Campaign`,
          description: `Earn ${rewardAssetType === "sol" ? "SOL" : symbol} rewards for engaging with ${name} on Twitter.`,
          totalFeeLamports: "0",
          startAtUnix,
          endAtUnix,
          epochDurationSeconds: 86400,
          trackingHandles,
          trackingHashtags,
          trackingUrls: [],
          signature: campaignSigB58,
          timestamp: timestampUnix,
          isManualLockup: true,
          rewardAssetType,
          rewardMint: rewardAssetType === "spl" ? tokenMint : undefined,
          rewardDecimals: registerData?.project?.decimals || 6,
        }),
      });

      const campaignData = await campaignRes.json();
      if (!campaignRes.ok) {
        setError(campaignData?.error || "Failed to create campaign");
        return;
      }

      // Success!
      setLaunchSuccess({
        commitmentId: campaignData?.campaign?.id ?? "",
        tokenMint,
        launchTxSig: "",
        imageUrl: draftImageUrl.trim() || null,
        name,
        symbol,
        postLaunchError: null,
      });

      toast({ kind: "success", message: "Project registered and campaign created!" });
    } catch (err) {
      console.error("Register error:", err);
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      {busy === "launch" && !launchSuccess ? (
        <div className="launchProgressOverlay">
          <div className="launchProgressModal">
            <div className="launchProgressSpinner" />
            <div className="launchProgressTitle">Launching...</div>
            <div className="launchProgressText">{launchProgress ?? "Working..."}</div>
            <div className="launchProgressMeta">Vanity launches can take longer. Do not close this tab.</div>
          </div>
        </div>
      ) : null}

      {/* Launch Success Modal */}
      {launchSuccess ? (
        <div className="launchSuccessOverlay">
          <div className="launchSuccessModal">
            <div className="launchSuccessIcon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>

            {launchSuccess.imageUrl ? <img src={launchSuccess.imageUrl} alt="" className="launchSuccessImage" /> : null}

            <h2 className="launchSuccessTitle">{launchSuccess.name || launchSuccess.symbol} Launched!</h2>
            <p className="launchSuccessSubtitle">Your token is now live on Pump.fun.</p>

            {launchSuccess.postLaunchError ? (
              <div
                className="createInfoBox"
                style={{ marginTop: 12, borderColor: "rgba(251, 191, 36, 0.35)", background: "rgba(251, 191, 36, 0.08)" }}
              >
                <div className="createInfoTitle" style={{ color: "rgba(251, 191, 36, 0.9)" }}>
                  Finalization warning
                </div>
                <div className="createInfoText">
                  Your token is live. We’re finishing a few setup steps in the background.
                  {process.env.NODE_ENV !== "production" ? ` (${launchSuccess.postLaunchError})` : null}
                </div>
              </div>
            ) : null}

            <div className="launchSuccessDetails">
              <div className="launchSuccessDetail">
                <span className="launchSuccessDetailLabel">Contract Address</span>
                <div className="launchSuccessDetailValue launchSuccessDetailMono">
                  {launchSuccess.tokenMint}
                  <button
                    className="launchSuccessCopyBtn"
                    onClick={() => {
                      navigator.clipboard.writeText(launchSuccess.tokenMint);
                    }}
                    title="Copy"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="launchSuccessDetail">
                <span className="launchSuccessDetailLabel">Launch Transaction</span>
                <a
                  href={`https://solscan.io/tx/${launchSuccess.launchTxSig}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="launchSuccessDetailValue launchSuccessDetailLink"
                >
                  {launchSuccess.launchTxSig.slice(0, 20)}...
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                </a>
              </div>
            </div>

            <div className="launchSuccessActions">
              <a
                href={`https://pump.fun/${launchSuccess.tokenMint}`}
                target="_blank"
                rel="noopener noreferrer"
                className="launchSuccessBtn launchSuccessBtnPrimary"
              >
                View on Pump.fun
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14" />
                  <path d="M12 5l7 7-7 7" />
                </svg>
              </a>
              <button
                className="launchSuccessBtn launchSuccessBtnSecondary"
                onClick={() => {
                  setLaunchSuccess(null);
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="createPage">
        <div className="createWrap">
          <div className="createHeader">
            <h1 className="createTitle">{isExistingProject ? "Register Existing Project" : "Launch on Pump.fun"}</h1>
            <p className="createSub">
              {isExistingProject
                ? "Register your existing token and create an engagement rewards campaign."
                : "Launch your token on Pump.fun with creator fees managed by AmpliFi."}
            </p>
          </div>

          {/* Mode Toggle */}
          <div className="createSection">
            <div className="createToggleRow" style={{ marginBottom: 16 }}>
              <div className="createToggleLeft">
                <div className="createToggleIcon">
                  <svg className="createToggleIconSvg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  </svg>
                </div>
                <div className="createToggleInfo">
                  <div className="createToggleName">Existing Project</div>
                  <div className="createToggleDesc">Register an existing token instead of launching a new one.</div>
                </div>
              </div>
              <label className="createSwitch">
                <input
                  className="createSwitchInput"
                  type="checkbox"
                  checked={isExistingProject}
                  onChange={(e) => setIsExistingProject(e.target.checked)}
                  disabled={busy != null}
                />
                <span className="createSwitchTrack" />
              </label>
            </div>
          </div>

          <div className="createDivider" />

          {/* Image Upload - only for new launches */}
          {!isExistingProject && (
          <div className="createSection">
            <label className={`createUploadZone ${draftImageUrl ? "createUploadZoneActive" : ""}`}>
              {draftImageUrl ? (
                <img src={draftImageUrl} alt="Token icon" className="createPreviewImg" />
              ) : (
                <svg className="createUploadIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="M21 15l-5-5L5 21" />
                </svg>
              )}
              <div className="createUploadText">{draftImageUrl ? "Image uploaded" : "Select image to upload"}</div>
              <div className="createUploadHint">or drag and drop it here</div>
              <span className="createUploadBtn">{busy === "upload:icon" ? "Uploading..." : "Select file"}</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                disabled={busy != null}
                onChange={async (e) => {
                  const f = e.currentTarget.files?.[0];
                  if (!f) return;
                  await uploadLaunchAsset({ file: f });
                }}
              />
            </label>
          </div>
          )}

          {!isExistingProject && <div className="createDivider" />}

          <div className="createSection">
            <h2 className="createSectionTitle">{isExistingProject ? "Project Details" : "Token Details"}</h2>
            <p className="createSectionSub">
              {isExistingProject
                ? "Enter your existing token's contract address and project info."
                : "Fill out the basics. We'll build and sign the Pump.fun transactions via your wallet."}
            </p>

            {error ? <div className="createError">{error}</div> : null}

            {/* Existing Project: Token Mint Input */}
            {isExistingProject && (
              <div className="createField" style={{ marginBottom: 16 }}>
                <label className="createLabel">Token Contract Address</label>
                <input
                  className="createInput"
                  value={existingTokenMint}
                  onChange={(e) => setExistingTokenMint(e.target.value.trim())}
                  placeholder="Enter your token's mint address..."
                  disabled={busy != null}
                />
                <div className="createFieldHint">
                  The SPL token mint address of your existing token.
                </div>
              </div>
            )}

            <div className="createFieldRow">
              <div className="createField">
                <label className="createLabel">Name</label>
                <input
                  className="createInput"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder="My Token"
                  maxLength={PUMPFUN_NAME_MAX}
                />
              </div>
              <div className="createField">
                <label className="createLabel">Ticker</label>
                <div className="tickerInputWrap">
                  <span className="tickerPrefix">$</span>
                  <input
                    className="createInput tickerInput"
                    value={draftSymbol}
                    onChange={(e) => setDraftSymbol(e.target.value.toUpperCase())}
                    placeholder="TOKEN"
                    maxLength={PUMPFUN_SYMBOL_MAX}
                  />
                </div>
              </div>
            </div>

            <div className="createField">
              <label className="createLabel">
                Description <span className="createLabelOptional">(Optional)</span>
              </label>
              <textarea
                className="createTextarea"
                value={draftDescription}
                onChange={(e) => setDraftDescription(e.target.value)}
                placeholder="Tell the world what this token is about..."
                maxLength={PUMPFUN_DESCRIPTION_BASE_MAX}
              />
              <div className="createFieldHint">
                Max {PUMPFUN_DESCRIPTION_BASE_MAX} characters. We&apos;ll append &quot;{PUMPFUN_ATTRIBUTION}&quot;.
              </div>
            </div>

            <div className="createFieldRow">
              <div className="createField">
                <label className="createLabel">
                  Website <span className="createLabelOptional">(Optional)</span>
                </label>
                <input className="createInput" value={draftWebsiteUrl} onChange={(e) => setDraftWebsiteUrl(e.target.value)} placeholder="https://..." />
              </div>
              <div className="createField">
                <label className="createLabel">
                  X <span className="createLabelOptional">(Optional)</span>
                </label>
                <input className="createInput" value={draftXUrl} onChange={(e) => setDraftXUrl(e.target.value)} placeholder="https://x.com/..." />
              </div>
            </div>

            <div className="createFieldRow">
              <div className="createField">
                <label className="createLabel">
                  Telegram <span className="createLabelOptional">(Optional)</span>
                </label>
                <input className="createInput" value={draftTelegramUrl} onChange={(e) => setDraftTelegramUrl(e.target.value)} placeholder="https://t.me/..." />
              </div>
              <div className="createField">
                <label className="createLabel">
                  Discord <span className="createLabelOptional">(Optional)</span>
                </label>
                <input className="createInput" value={draftDiscordUrl} onChange={(e) => setDraftDiscordUrl(e.target.value)} placeholder="https://discord.gg/..." />
              </div>
            </div>

            {/* New Launch: Initial Buy */}
            {!isExistingProject && (
            <div className="createField">
              <label className="createLabel">
                Initial buy <span className="createLabelOptional">(Optional)</span>
              </label>
              <input className="createInput" value={devBuySol} onChange={(e) => setDevBuySol(e.target.value)} placeholder="0.10" inputMode="decimal" />
              <div className="createFieldHint">How much SOL to spend during the initial launch buy.</div>
            </div>
            )}

            {/* Existing Project: Campaign Configuration */}
            {isExistingProject && (
              <>
                <div className="createDivider" style={{ margin: "24px 0" }} />
                <h3 className="createSectionTitle" style={{ fontSize: "1rem", marginBottom: 8 }}>Campaign Configuration</h3>
                <p className="createSectionSub" style={{ marginBottom: 16 }}>Set up Twitter tracking for your engagement rewards campaign.</p>

                <div className="createFieldRow">
                  <div className="createField">
                    <label className="createLabel">Tracking Handle</label>
                    <input
                      className="createInput"
                      value={trackingHandle}
                      onChange={(e) => setTrackingHandle(e.target.value.replace(/^@/, ""))}
                      placeholder="@yourproject"
                      disabled={busy != null}
                    />
                    <div className="createFieldHint">Twitter handle to track mentions of.</div>
                  </div>
                  <div className="createField">
                    <label className="createLabel">
                      Tracking Hashtag <span className="createLabelOptional">(Optional)</span>
                    </label>
                    <input
                      className="createInput"
                      value={trackingHashtag}
                      onChange={(e) => setTrackingHashtag(e.target.value.replace(/^#/, ""))}
                      placeholder="#yourtoken"
                      disabled={busy != null}
                    />
                    <div className="createFieldHint">Hashtag to track.</div>
                  </div>
                </div>

                <div className="createFieldRow">
                  <div className="createField">
                    <label className="createLabel">Campaign Duration</label>
                    <select
                      className="createInput"
                      value={campaignDurationDays}
                      onChange={(e) => setCampaignDurationDays(e.target.value)}
                      disabled={busy != null}
                    >
                      <option value="7">7 days</option>
                      <option value="14">14 days</option>
                      <option value="30">30 days</option>
                      <option value="60">60 days</option>
                      <option value="90">90 days</option>
                    </select>
                  </div>
                  <div className="createField">
                    <label className="createLabel">Reward Asset</label>
                    <select
                      className="createInput"
                      value={rewardAssetType}
                      onChange={(e) => setRewardAssetType(e.target.value as "sol" | "spl")}
                      disabled={busy != null}
                    >
                      <option value="sol">SOL</option>
                      <option value="spl">Your Token (SPL)</option>
                    </select>
                    <div className="createFieldHint">
                      {rewardAssetType === "sol"
                        ? "Distribute SOL rewards to top engagers."
                        : "Distribute your own token as rewards."}
                    </div>
                  </div>
                </div>

                <div className="createInfoBox" style={{ marginTop: 16 }}>
                  <div className="createInfoTitle">How it works</div>
                  <div className="createInfoText">
                    1. Register your project and create a campaign<br />
                    2. Deposit {rewardAssetType === "sol" ? "SOL" : "your tokens"} to fund rewards<br />
                    3. Holders join and engage on Twitter<br />
                    4. Rewards are distributed based on engagement scores
                  </div>
                </div>
              </>
            )}

            {/* New Launch: Vanity Toggle */}
            {!isExistingProject && (
            <div className="createToggleRow">
              <div className="createToggleLeft">
                <div className="createToggleIcon">
                  <svg className="createToggleIconSvg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2l1.09 3.26L16 6l-2.91 2.74L14.18 12 12 10.27 9.82 12l1.09-3.26L8 6l2.91-.74L12 2z" />
                    <path d="M5 13l-3 3 3 3" />
                    <path d="M19 13l3 3-3 3" />
                  </svg>
                </div>
                <div className="createToggleInfo">
                  <div className="createToggleName">Vanity suffix “pump”</div>
                  <div className="createToggleDesc">Generates a pump-suffix mint. Can take 1–3 minutes.</div>
                </div>
              </div>
              <label className="createSwitch">
                <input
                  className="createSwitchInput"
                  type="checkbox"
                  checked={useVanity}
                  onChange={(e) => setUseVanity(e.target.checked)}
                  disabled={busy != null}
                />
                <span className="createSwitchTrack" />
              </label>
            </div>
            )}

            
            {!connected ? (
              <div className="createInfoBox" style={{ marginTop: 18 }}>
                <div className="createInfoTitle">Connect wallet</div>
                <div className="createInfoText">Connect your wallet to {isExistingProject ? "register your project" : "launch"}.</div>
                <div style={{ height: 12 }} />
                <button className="createUploadBtn" onClick={() => setVisible(true)} disabled={busy != null}>
                  Connect
                </button>
              </div>
            ) : null}

            <button
              className="createSubmitBtn"
              onClick={isExistingProject ? handleRegisterProject : handleLaunch}
              disabled={
                busy != null ||
                !draftName.trim().length ||
                !draftSymbol.trim().length ||
                (isExistingProject ? !existingTokenMint.trim().length || !trackingHandle.trim().length : !draftImageUrl.trim().length)
              }
            >
              {isExistingProject
                ? (busy === "register" ? "Registering…" : "Register & Create Campaign")
                : (busy === "launch" ? (useVanity ? "Launching (vanity)…" : "Launching…") : "Launch")}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

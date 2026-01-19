"use client";

import { useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import bs58 from "bs58";
import { Transaction } from "@solana/web3.js";
import { useToast } from "@/app/components/ToastProvider";

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

  const [draftName, setDraftName] = useState("");
  const [draftSymbol, setDraftSymbol] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftImageUrl, setDraftImageUrl] = useState("");
  const [draftWebsiteUrl, setDraftWebsiteUrl] = useState("");
  const [draftXUrl, setDraftXUrl] = useState("");
  const [draftTelegramUrl, setDraftTelegramUrl] = useState("");
  const [draftDiscordUrl, setDraftDiscordUrl] = useState("");
  const [devBuySol, setDevBuySol] = useState("0.1");
  const [useVanity, setUseVanity] = useState(true);

  const [bagsDevTwitter, setBagsDevTwitter] = useState("");
  const [bagsCreatorTwitter, setBagsCreatorTwitter] = useState("");
  const [bagsDevFeePct, setBagsDevFeePct] = useState("25");
  const [bagsCreatorFeePct, setBagsCreatorFeePct] = useState("25");

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [launchSuccess, setLaunchSuccess] = useState<LaunchSuccessState | null>(null);

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
    const creatorAuthMessage = `Commit To Ship\nCreator Auth\nAction: launch_access\nWallet: ${payerWallet}\nTimestamp: ${timestampUnix}`;
    const signatureBytes = await signMessage(new TextEncoder().encode(creatorAuthMessage));
    const next = { walletPubkey: payerWallet, timestampUnix, signatureB58: bs58.encode(signatureBytes) };
    launchCreatorAuthRef.current = next;
    return next;
  }

  async function uploadLaunchAsset(input: { file: File }): Promise<void> {
    setError(null);
    try {
      if (!input.file) return;
      setBusy("upload:icon");
      const creatorAuth = await getCreatorAuth();
      const payerWallet = creatorAuth.walletPubkey;

      const infoRes = await fetch("/api/launch/assets/upload-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "icon",
          contentType: input.file.type || "image/png",
          payerWallet,
          creatorAuth,
        }),
      });
      const info = await infoRes.json();
      if (!infoRes.ok) throw new Error(String(info?.error ?? "Upload URL request failed"));

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

      setDraftImageUrl(publicUrl);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      setError(msg);
      toast({ kind: "error", message: msg });
    } finally {
      setBusy(null);
    }
  }

  const handleLaunch = async () => {
    setError(null);
    setLaunchSuccess(null);

    if (!connected || !publicKey || !signMessage) {
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

    const devTwitter = bagsDevTwitter.trim();
    const creatorTwitter = bagsCreatorTwitter.trim();
    const devPct = Number.parseFloat(String(bagsDevFeePct ?? "0"));
    const creatorPct = Number.parseFloat(String(bagsCreatorFeePct ?? "0"));
    const devBps = Number.isFinite(devPct) ? Math.round(devPct * 100) : NaN;
    const creatorBps = Number.isFinite(creatorPct) ? Math.round(creatorPct * 100) : NaN;

    if (!name) return setError("Token name is required");
    if (!symbol) return setError("Token symbol is required");
    if (symbol.length > 10) return setError("Symbol must be 10 characters or less");
    if (!imageUrl) return setError("Token image is required");
    if (!devTwitter) return setError("Dev Twitter is required");
    if (!creatorTwitter) return setError("Creator Twitter is required");
    if (!Number.isFinite(devBps) || devBps < 0 || devBps > 5000) return setError("Dev fee must be between 0% and 50%");
    if (!Number.isFinite(creatorBps) || creatorBps < 0 || creatorBps > 5000) return setError("Creator fee must be between 0% and 50%");
    if (devBps + creatorBps !== 5000) return setError("Dev + Creator fees must equal 50% total");

    try {
      setBusy("launch");
      const creatorAuth = await getCreatorAuth();

      const solAmount = parseFloat(String(devBuySol ?? "0")) || 0;
      const initialBuySol = Math.max(0, solAmount);

      const prepRes = await fetch("/api/launch/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payerWallet: creatorAuth.walletPubkey, devBuySol: initialBuySol, creatorAuth }),
      });
      const prep = await prepRes.json();
      if (!prepRes.ok) {
        setError(prep?.error || "Launch prepare failed");
        return;
      }

      if (prep?.needsFunding && prep?.txBase64) {
        const tx = Transaction.from(base64ToBytes(String(prep.txBase64)));
        const sig = await sendTransaction(tx, connection);
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
      }

      const execRes = await fetch("/api/launch/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletId: String(prep.walletId ?? ""),
          treasuryWallet: String(prep.treasuryWallet ?? ""),
          creatorWallet: String(prep.treasuryWallet ?? ""),
          payerWallet: creatorAuth.walletPubkey,
          payoutWallet: creatorAuth.walletPubkey,
          name,
          symbol,
          description: draftDescription.trim(),
          imageUrl,
          statement: `Launch ${symbol} via AmpliFi`,
          websiteUrl: draftWebsiteUrl.trim(),
          xUrl: normalizeXUrl(draftXUrl),
          telegramUrl: normalizeTelegramUrl(draftTelegramUrl),
          discordUrl: draftDiscordUrl.trim(),
          bagsDevTwitter: devTwitter,
          bagsCreatorTwitter: creatorTwitter,
          bagsDevBps: devBps,
          bagsCreatorBps: creatorBps,
          devBuySol: initialBuySol,
          useVanity,
          vanitySuffix: "BAGS",
          creatorAuth,
        }),
      });

      const exec = await execRes.json();
      if (!execRes.ok) {
        setError(exec?.error || "Launch failed");
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
      setBusy(null);
    }
  };

  return (
    <>
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
            <p className="launchSuccessSubtitle">Your token is now live on Bags.fm.</p>

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
                href={`https://bags.fm/${launchSuccess.tokenMint}`}
                target="_blank"
                rel="noopener noreferrer"
                className="launchSuccessBtn launchSuccessBtnPrimary"
              >
                View on Bags.fm
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
            <h1 className="createTitle">Launch on Bags.fm</h1>
            <p className="createSub">Launch your token and auto-configure fee sharing. Vanity suffix “BAGS” is optional.</p>
          </div>

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

          <div className="createDivider" />

          <div className="createSection">
            <h2 className="createSectionTitle">Token Details</h2>
            <p className="createSectionSub">Fill out the basics. We’ll build and sign the Bags transactions via your wallet.</p>

            {error ? <div className="createError">{error}</div> : null}

            <div className="createFieldRow">
              <div className="createField">
                <label className="createLabel">Name</label>
                <input className="createInput" value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder="My Token" maxLength={48} />
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
                    maxLength={10}
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
              />
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

            <div className="createDivider" style={{ margin: "18px 0" }} />

            <h2 className="createSectionTitle">Fee Split</h2>
            <p className="createSectionSub">Dev + Creator = 50%. Raiders are locked at 50%.</p>

            <div className="createFieldRow">
              <div className="createField">
                <label className="createLabel">Dev Twitter</label>
                <input
                  className="createInput"
                  value={bagsDevTwitter}
                  onChange={(e) => setBagsDevTwitter(e.target.value)}
                  placeholder="@dev"
                  disabled={busy != null}
                />
              </div>
              <div className="createField">
                <label className="createLabel">Dev Fee %</label>
                <input
                  className="createInput"
                  value={bagsDevFeePct}
                  onChange={(e) => setBagsDevFeePct(e.target.value)}
                  placeholder="25"
                  inputMode="decimal"
                  disabled={busy != null}
                />
              </div>
            </div>

            <div className="createFieldRow">
              <div className="createField">
                <label className="createLabel">Creator Twitter</label>
                <input
                  className="createInput"
                  value={bagsCreatorTwitter}
                  onChange={(e) => setBagsCreatorTwitter(e.target.value)}
                  placeholder="@creator"
                  disabled={busy != null}
                />
              </div>
              <div className="createField">
                <label className="createLabel">Creator Fee %</label>
                <input
                  className="createInput"
                  value={bagsCreatorFeePct}
                  onChange={(e) => setBagsCreatorFeePct(e.target.value)}
                  placeholder="25"
                  inputMode="decimal"
                  disabled={busy != null}
                />
              </div>
            </div>

            <div className="createInfoBox" style={{ marginTop: 12 }}>
              <div className="createInfoTitle">Raiders</div>
              <div className="createInfoText">50% (locked)</div>
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

            <div className="createField">
              <label className="createLabel">
                Initial buy <span className="createLabelOptional">(Optional)</span>
              </label>
              <input className="createInput" value={devBuySol} onChange={(e) => setDevBuySol(e.target.value)} placeholder="0.10" inputMode="decimal" />
              <div className="createFieldHint">How much SOL to spend during the initial launch buy.</div>
            </div>

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
                  <div className="createToggleName">Vanity suffix “BAGS”</div>
                  <div className="createToggleDesc">Generating a vanity mint can take 1–3 minutes.</div>
                </div>
              </div>
              <label className="createSwitch">
                <input
                  className="createSwitchInput"
                  type="checkbox"
                  checked={useVanity}
                  onChange={(e) => setUseVanity(e.target.checked)}
                />
                <span className="createSwitchTrack" />
              </label>
            </div>

            {!connected ? (
              <div className="createInfoBox" style={{ marginTop: 18 }}>
                <div className="createInfoTitle">Connect wallet</div>
                <div className="createInfoText">Connect your wallet to launch.</div>
                <div style={{ height: 12 }} />
                <button className="createUploadBtn" onClick={() => setVisible(true)} disabled={busy != null}>
                  Connect
                </button>
              </div>
            ) : null}

            <button
              className="createSubmitBtn"
              onClick={handleLaunch}
              disabled={
                busy != null ||
                !draftName.trim().length ||
                !draftSymbol.trim().length ||
                !draftImageUrl.trim().length ||
                !bagsDevTwitter.trim().length ||
                !bagsCreatorTwitter.trim().length
              }
            >
              {busy === "launch" ? (useVanity ? "Launching (vanity)…" : "Launching…") : "Launch"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

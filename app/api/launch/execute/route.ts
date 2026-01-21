import { NextResponse } from "next/server";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { Buffer } from "buffer";
import crypto from "crypto";

import { checkRateLimit, getClientIp } from "../../../lib/rateLimit";
import { getSafeErrorMessage } from "../../../lib/safeError";
import { getConnection, getTokenProgramIdForMint } from "../../../lib/solana";
import { privyGetWalletById, privyRefundWalletToDestination } from "../../../lib/privy";
import { launchTokenViaPumpfun, uploadPumpfunMetadata, getCreatorVaultPda } from "../../../lib/pumpfun";
import { hasBagsApiKey, launchTokenViaBags } from "../../../lib/bags";
import { createRewardCommitmentRecord, insertCommitment, listCommitments, updateDevBuyTokenAmount } from "../../../lib/escrowStore";
import { upsertProjectProfile } from "../../../lib/projectProfilesStore";
import { auditLog } from "../../../lib/auditLog";
import { getAdminCookieName, getAdminSessionWallet, getAllowedAdminWallets, verifyAdminOrigin } from "../../../lib/adminSession";
import { verifyCreatorAuthOrThrow } from "../../../lib/creatorAuth";
import { getLaunchTreasuryWallet } from "../../../lib/launchTreasuryStore";
import { estimateVanityRefillSeconds, getVanityAvailableCount } from "../../../lib/vanityPool";

export const runtime = "nodejs";
export const maxDuration = 300;

const SOLANA_CAIP2 = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"; // mainnet
const IS_PROD = process.env.NODE_ENV === "production";
const PUMPFUN_NAME_MAX = 32;
const PUMPFUN_SYMBOL_MAX = 10;
const PUMPFUN_DESCRIPTION_MAX = 600;
const PUMPFUN_ATTRIBUTION = "Launched with AmpliFi";
const PUMPFUN_ATTRIBUTION_DELIM = "\n\n";
const LAUNCH_OVERHEAD_LAMPORTS = 30_000_000;

function getVanityLaunchMinAvailable(): number {
  const raw = Number(process.env.VANITY_LAUNCH_MIN_AVAILABLE ?? 1);
  if (!Number.isFinite(raw)) return 1;
  return Math.max(1, Math.floor(raw));
}

function isPublicLaunchEnabled(): boolean {
  const raw = String(process.env.AMPLIFI_PUBLIC_LAUNCHES ?? "true").trim().toLowerCase();
  return raw !== "0" && raw !== "false" && raw !== "no" && raw !== "off";
}

function normalizeTwitterUsername(raw: string): string {
  let t = String(raw ?? "").trim();
  if (!t) return "";
  t = t.replace(/^https?:\/\/(www\.)?/i, "");
  t = t.replace(/^(twitter\.com|x\.com)\//i, "");
  t = t.replace(/^@/, "");
  t = t.split(/[/?#]/)[0] ?? "";
  return String(t).trim();
}

function parseBps(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const i = Math.floor(n);
  if (i < 0 || i > 10_000) return null;
  return i;
}

export async function GET() {
  const res = NextResponse.json({ error: "Method Not Allowed. Use POST /api/launch/execute." }, { status: 405 });
  res.headers.set("allow", "POST, OPTIONS");
  return res;
}

export async function OPTIONS(req: Request) {
  const expected = String(process.env.APP_ORIGIN ?? "").trim();
  const origin = req.headers.get("origin") ?? "";

  try {
    verifyAdminOrigin(req);
  } catch {
    const res = new NextResponse(null, { status: 204 });
    res.headers.set("allow", "POST, OPTIONS");
    return res;
  }

  const res = new NextResponse(null, { status: 204 });
  res.headers.set("allow", "POST, OPTIONS");
  res.headers.set("access-control-allow-origin", origin || expected);
  res.headers.set("access-control-allow-methods", "POST, OPTIONS");
  res.headers.set("access-control-allow-headers", "content-type");
  res.headers.set("access-control-allow-credentials", "true");
  res.headers.set("vary", "origin");
  return res;
}

export async function POST(req: Request) {
  const requestId = crypto.randomBytes(8).toString("hex");
  let stage = "init";
  let platform: "pumpfun" | "bags" = "pumpfun";
  let walletId = "";
  let treasuryWallet = "";
  let treasuryPubkey: PublicKey | null = null;
  let launchWalletId = "";
  let creatorWallet = "";
  let payerWallet = "";
  let commitmentId = "";
  let launchTxSig = "";
  let tokenMintB58 = "";
  let metadataUri = "";
  let escrowPubkey = "";
  let onchainOk = false;
  let creatorPubkey: PublicKey | null = null;
  let payerPubkey: PublicKey | null = null;
  let funded = false;
  let fundedLamports = 0;
  let fundSignature = "";
  let bondingCurve = "";
  let creatorVaultPubkey = "";
  let vanityGenerationMs: number | null = null;
  let vanitySource: string | null = null;

  try {
    const ip = getClientIp(req);
    const isUnknownIp = ip === "unknown" || ip.startsWith("unknown:");
    if (!isUnknownIp) {
      stage = "rate_limit_ip";
      const ipRl = await checkRateLimit(req, { keyPrefix: "launch:execute", limit: 120, windowSeconds: 60 });
      if (!ipRl.allowed) {
        const res = NextResponse.json({ error: "Rate limit exceeded", retryAfterSeconds: ipRl.retryAfterSeconds }, { status: 429 });
        res.headers.set("retry-after", String(ipRl.retryAfterSeconds));
        return res;
      }
    }

    verifyAdminOrigin(req);

    stage = "read_body";
    const clone = req.clone();
    let body: any;
    try {
      body = await req.json();
    } catch {
      let bodyText = "";
      try {
        bodyText = await clone.text();
      } catch {
        bodyText = "";
      }
      const contentType = String(req.headers.get("content-type") ?? "");
      const contentLength = String(req.headers.get("content-length") ?? "");
      const res = NextResponse.json(
        {
          error: "Invalid JSON request body",
          requestId,
          stage,
          contentType,
          contentLength,
          bodyLength: bodyText.length,
        },
        { status: 400 }
      );
      res.headers.set("x-request-id", requestId);
      return res;
    }

    payerWallet = typeof body?.payerWallet === "string" ? body.payerWallet.trim() : "";
    if (!payerWallet) return NextResponse.json({ error: "payerWallet is required" }, { status: 400 });

    stage = "rate_limit_wallet";
    console.log("[execute] Starting, payerWallet:", payerWallet);
    const walletRl = await checkRateLimit(req, { keyPrefix: `launch:execute:${payerWallet}`, limit: 20, windowSeconds: 60 });
    if (!walletRl.allowed) {
      const res = NextResponse.json({ error: "Rate limit exceeded", retryAfterSeconds: walletRl.retryAfterSeconds }, { status: 429 });
      res.headers.set("retry-after", String(walletRl.retryAfterSeconds));
      return res;
    }
    stage = "parse_payer_pubkey";
    try {
      payerPubkey = new PublicKey(payerWallet);
    } catch {
      return NextResponse.json({ error: "Invalid payer wallet address" }, { status: 400 });
    }

    stage = "access_control";
    const publicLaunchEnabled = isPublicLaunchEnabled();
    if (!publicLaunchEnabled) {
      const cookieHeader = String(req.headers.get("cookie") ?? "");
      const hasAdminCookie = cookieHeader.includes(`${getAdminCookieName()}=`);
      const allowed = getAllowedAdminWallets();
      const adminWallet = await getAdminSessionWallet(req);

      const adminOk = Boolean(adminWallet) && allowed.has(String(adminWallet));
      if (!adminOk) {
        try {
          verifyCreatorAuthOrThrow({
            payload: body?.creatorAuth,
            action: "launch_access",
            expectedWalletPubkey: payerPubkey.toBase58(),
            maxSkewSeconds: 5 * 60,
          });
        } catch (e) {
          const msg = (e as Error)?.message ?? String(e);
          await auditLog("launch_execute_denied", { hasAdminCookie, adminWallet: adminWallet ?? null, payerWallet, error: msg });
          const status = msg.toLowerCase().includes("not approved") ? 403 : 401;
          return NextResponse.json(
            {
              error: msg,
              hint: "If you're part of the closed beta, ask to be added to AMPLIFI_CREATOR_WALLET_PUBKEYS.",
            },
            { status }
          );
        }
      }
    }

    walletId = typeof body.walletId === "string" ? body.walletId.trim() : "";
    treasuryWallet = typeof body.treasuryWallet === "string" ? body.treasuryWallet.trim() : "";
    creatorWallet = typeof body.creatorWallet === "string" ? body.creatorWallet.trim() : "";

    if (!treasuryWallet) treasuryWallet = creatorWallet;

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const symbol = typeof body.symbol === "string" ? body.symbol.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";
    const statement = typeof body.statement === "string" ? body.statement.trim() : "";
    const payoutWallet = typeof body.payoutWallet === "string" ? body.payoutWallet.trim() : "";

    const websiteUrl = typeof body.websiteUrl === "string" ? body.websiteUrl.trim() : "";
    const xUrl = typeof body.xUrl === "string" ? body.xUrl.trim() : "";
    const telegramUrl = typeof body.telegramUrl === "string" ? body.telegramUrl.trim() : "";
    const discordUrl = typeof body.discordUrl === "string" ? body.discordUrl.trim() : "";
    const bannerUrl = typeof body.bannerUrl === "string" ? body.bannerUrl.trim() : "";

    fundSignature = typeof body?.fundSignature === "string" ? body.fundSignature.trim() : "";

    const devBuySolRaw = body.devBuySol;
    const devBuySolParsed = Number(devBuySolRaw ?? 0);
    const devBuySol = Number.isFinite(devBuySolParsed) && devBuySolParsed >= 0 ? devBuySolParsed : 0;
    const devBuyLamports = Math.floor(devBuySol * 1_000_000_000);
    const requiredLamports = devBuyLamports + LAUNCH_OVERHEAD_LAMPORTS;

    const platformRaw = typeof body?.platform === "string" ? body.platform.trim().toLowerCase() : "";
    platform = platformRaw === "bags" ? "bags" : "pumpfun";

    // Bags.fm launches temporarily disabled - coming soon
    if (platform === "bags") {
      return NextResponse.json({ error: "Bags.fm launches are coming soon. Please use Pump.fun for now." }, { status: 503 });
    }

    const useVanityRaw = body?.useVanity !== false;
    const vanitySuffixRaw = typeof body?.vanitySuffix === "string" ? body.vanitySuffix.trim() : "";
    const vanitySuffixRequested = vanitySuffixRaw || "AMP";

    // Note: Bags.fm launches are temporarily disabled (early return above)
    // so platform is always "pumpfun" at this point

    const useVanity = useVanityRaw;
    const vanitySuffix = "AMP";
    const vanityMaxAttempts = 50_000_000; // Fixed - users cannot alter speed

    if (useVanity) {
      if (String(vanitySuffixRequested).trim().toUpperCase() !== "AMP") {
        return NextResponse.json({ error: 'vanitySuffix must be "AMP"' }, { status: 400 });
      }
    }

    if (platform === "pumpfun" && useVanity) {
      stage = "vanity_pool_gate";
      const minRequired = getVanityLaunchMinAvailable();
      const available = await getVanityAvailableCount({ suffix: vanitySuffix });
      if (available < minRequired) {
        const needed = Math.max(1, minRequired - available);
        const eta = await estimateVanityRefillSeconds({ suffix: vanitySuffix, needed });
        const retryAfterSeconds = eta.estimatedSecondsUntilReady != null ? Math.max(5, eta.estimatedSecondsUntilReady) : 30;
        const res = NextResponse.json(
          {
            error: `Vanity pool is low for suffix "${vanitySuffix}". Please wait for more mints to be generated or disable vanity.`,
            code: "vanity_pool_low",
            suffix: vanitySuffix,
            available,
            minRequired,
            secondsPerMint: eta.secondsPerMint,
            estimatedSecondsUntilReady: eta.estimatedSecondsUntilReady,
            requestId,
            stage,
          },
          { status: 409 }
        );
        res.headers.set("retry-after", String(retryAfterSeconds));
        res.headers.set("x-request-id", requestId);
        return res;
      }
    }

    if (!walletId) return NextResponse.json({ error: "walletId is required" }, { status: 400 });
    if (!treasuryWallet) return NextResponse.json({ error: "treasuryWallet is required" }, { status: 400 });
    if (!payerWallet) return NextResponse.json({ error: "payerWallet is required" }, { status: 400 });

    stage = "verify_launch_treasury_wallet";
    let treasuryRecord = null as Awaited<ReturnType<typeof getLaunchTreasuryWallet>>;
    try {
      treasuryRecord = await getLaunchTreasuryWallet(payerPubkey.toBase58());
    } catch {
      treasuryRecord = null;
    }
    if (!treasuryRecord) {
      stage = "verify_launch_treasury_wallet_fallback";
      try {
        const w = await privyGetWalletById({ walletId });
        if (String(w.address).trim() !== String(treasuryWallet).trim()) {
          const res = NextResponse.json(
            {
              error: "Invalid launch wallet",
              requestId,
              stage,
            },
            { status: 400 }
          );
          res.headers.set("x-request-id", requestId);
          return res;
        }
        await auditLog("launch_execute_treasury_fallback_ok", {
          payerWallet,
          walletId,
          treasuryWallet,
        });
      } catch (e) {
        const res = NextResponse.json(
          {
            error: "Launch treasury wallet not found",
            hint: "Call /api/launch/prepare again and retry.",
            requestId,
            stage,
          },
          { status: 409 }
        );
        res.headers.set("x-request-id", requestId);
        return res;
      }
    } else if (treasuryRecord.walletId !== walletId || treasuryRecord.treasuryWallet !== treasuryWallet) {
      await auditLog("launch_execute_denied_wallet_mismatch", {
        payerWallet,
        expectedWalletId: treasuryRecord.walletId,
        expectedTreasuryWallet: treasuryRecord.treasuryWallet,
        walletId,
        treasuryWallet,
      });
      const res = NextResponse.json({ error: "Invalid launch wallet", requestId, stage }, { status: 400 });
      res.headers.set("x-request-id", requestId);
      return res;
    }

    if (!name) return NextResponse.json({ error: "Token name is required" }, { status: 400 });
    if (!symbol) return NextResponse.json({ error: "Token symbol is required" }, { status: 400 });
    if (!imageUrl) return NextResponse.json({ error: "Token image is required" }, { status: 400 });
    if (!payoutWallet) return NextResponse.json({ error: "Payout wallet is required" }, { status: 400 });
    if (name.length > PUMPFUN_NAME_MAX) {
      return NextResponse.json({ error: `Token name must be ${PUMPFUN_NAME_MAX} characters or less` }, { status: 400 });
    }
    if (symbol.length > PUMPFUN_SYMBOL_MAX) {
      return NextResponse.json({ error: `Token symbol must be ${PUMPFUN_SYMBOL_MAX} characters or less` }, { status: 400 });
    }

    let payoutPubkey: PublicKey;
    try {
      payoutPubkey = new PublicKey(payoutWallet);
    } catch {
      return NextResponse.json({ error: "Invalid payout wallet address" }, { status: 400 });
    }

    // payerPubkey is validated earlier for closed beta auth

    try {
      treasuryPubkey = new PublicKey(treasuryWallet);
    } catch {
      return NextResponse.json({ error: "Invalid treasury wallet address" }, { status: 400 });
    }

    stage = "verify_treasury_balance";
    const connection = getConnection();
    const treasuryBalance = await connection.getBalance(treasuryPubkey, "confirmed");
    const balanceBufferLamports = 50_000;
    const rentExemptMinRaw = await connection.getMinimumBalanceForRentExemption(0);
    const rentExemptMin = Number.isFinite(rentExemptMinRaw) && rentExemptMinRaw > 0 ? rentExemptMinRaw : 890_880;
    const missingLamports = Math.max(0, requiredLamports + balanceBufferLamports + rentExemptMin - treasuryBalance);
    if (missingLamports > 0) {
      const latest = await connection.getLatestBlockhash("confirmed");

      const tx = new Transaction();
      tx.feePayer = payerPubkey;
      tx.recentBlockhash = latest.blockhash;
      tx.lastValidBlockHeight = latest.lastValidBlockHeight;
      tx.add(
        SystemProgram.transfer({
          fromPubkey: payerPubkey,
          toPubkey: treasuryPubkey,
          lamports: missingLamports,
        })
      );

      const txBytes = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
      const txBase64 = Buffer.from(Uint8Array.from(txBytes)).toString("base64");

      await auditLog("launch_execute_needs_funding", {
        walletId,
        treasuryWallet,
        payerWallet,
        requiredLamports,
        currentLamports: treasuryBalance,
        missingLamports,
      });

      return NextResponse.json({
        ok: true,
        platform,
        needsFunding: true,
        walletId,
        treasuryWallet,
        payerWallet,
        requiredLamports,
        currentLamports: treasuryBalance,
        missingLamports,
        txBase64,
        txFormat: "base64",
        txType: "fund_treasury_wallet",
        blockhash: latest.blockhash,
        lastValidBlockHeight: latest.lastValidBlockHeight,
        stage: "needs_funding",
      });
    }

    stage = "use_treasury_wallet";
    launchWalletId = walletId;
    creatorWallet = treasuryWallet;
    creatorPubkey = treasuryPubkey;

    if (!creatorPubkey) {
      throw Object.assign(new Error("Invalid creator wallet"), { status: 400 });
    }

    const creatorWalletPubkey = creatorPubkey.toBase58();
    let existingManaged = null as Awaited<ReturnType<typeof listCommitments>>[number] | null;
    try {
      existingManaged =
        (await listCommitments()).find(
        (c) =>
          c.kind === "creator_reward" &&
          c.creatorFeeMode === "managed" &&
          c.status !== "archived" &&
          c.authority === creatorWalletPubkey
        ) ?? null;
    } catch (commitmentCheckErr) {
      await auditLog("launch_commitment_check_error", {
        stage,
        creatorWallet: creatorWalletPubkey,
        error: getSafeErrorMessage(commitmentCheckErr),
      });
      existingManaged = null;
    }
    if (existingManaged) {
      await auditLog("launch_denied_shared_creator_wallet", {
        creatorWallet: creatorWalletPubkey,
        existingCommitmentId: existingManaged.id,
      });
      return NextResponse.json(
        {
          error: "Creator wallet already has a managed creator reward commitment",
          creatorWallet: creatorWalletPubkey,
          existingCommitmentId: existingManaged.id,
          hint: "Managed launches require a unique creator wallet. Use a different payer wallet or use manual mode (assisted).",
        },
        { status: 409 }
      );
    }

    stage = "prepare_description";
    const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const withAttribution = (raw: string): string => {
      const trimmed = String(raw ?? "").trim();
      const cleaned = trimmed.replace(new RegExp(`\\s*${escapeRegExp(PUMPFUN_ATTRIBUTION)}\\s*`, "gi"), "").trim();
      const delim = cleaned.length ? PUMPFUN_ATTRIBUTION_DELIM : "";
      const reserved = PUMPFUN_ATTRIBUTION.length + delim.length;
      const baseMax = Math.max(0, PUMPFUN_DESCRIPTION_MAX - reserved);
      const base = cleaned.slice(0, baseMax).trimEnd();
      const out = (base ? base + delim : "") + PUMPFUN_ATTRIBUTION;
      return out.length <= PUMPFUN_DESCRIPTION_MAX ? out : PUMPFUN_ATTRIBUTION;
    };

    const pumpfunDescription = withAttribution(description);

    commitmentId = crypto.randomBytes(16).toString("hex");

    stage = "audit_attempt";
    await auditLog("launch_attempt", {
      requestId,
      commitmentId,
      payerWallet,
      payoutWallet: payoutPubkey.toBase58(),
      name,
      symbol,
      treasuryWallet,
      treasuryWalletId: walletId,
      launchCreatorWallet: creatorWallet,
      launchWalletId,
      requiredLamports,
      fundSignature,
      vanitySuffix: useVanity ? vanitySuffix : null,
      vanityMaxAttempts: useVanity ? vanityMaxAttempts : null,
      platform,
    });

    // Note: Bags.fm launches are temporarily disabled (early return above)
    // so we always go through the Pump.fun path here
    {
      stage = "upload_metadata";
      console.log("[execute] Stage: upload_metadata");
      // Upload metadata to Pump.fun's IPFS
      const metadataResult = await uploadPumpfunMetadata({
        name,
        symbol,
        description: pumpfunDescription,
        imageUrl,
        twitterUrl: xUrl || undefined,
        websiteUrl: websiteUrl || undefined,
        telegramUrl: telegramUrl || undefined,
      });

      metadataUri = metadataResult.metadataUri;
      console.log("[execute] Metadata uploaded:", metadataUri);

      stage = "launch_via_pumpfun";
      console.log("[execute] Stage: launch_via_pumpfun");
      // Launch token via Pump.fun with Privy wallet signing
      // Creator fees go to the launch wallet (managed by AmpliFi for campaigns)
      const pumpfunResult = await launchTokenViaPumpfun({
        name,
        symbol,
        metadataUri,
        initialBuyLamports: devBuyLamports,
        privyWalletId: launchWalletId,
        launchWalletPubkey: creatorPubkey,
        isMayhemMode: false,
        useVanity,
        vanitySuffix,
        vanityMaxAttempts,
      });

      tokenMintB58 = pumpfunResult.tokenMint;
      bondingCurve = pumpfunResult.bondingCurve;
      creatorVaultPubkey = pumpfunResult.creatorVault;
      launchTxSig = pumpfunResult.launchSignature;
      vanityGenerationMs = pumpfunResult.vanityGenerationMs ?? null;
      vanitySource = pumpfunResult.vanitySource ?? null;

      await auditLog("launch_onchain_success", {
        commitmentId,
        tokenMint: tokenMintB58,
        launchTxSig,
        treasuryWallet,
        treasuryWalletId: walletId,
        launchCreatorWallet: creatorWallet,
        launchWalletId,
        bondingCurve,
        creatorVault: creatorVaultPubkey,
        vanityGenerationMs,
        vanitySource,
        platform: "pumpfun",
      });
    }

    onchainOk = true;
    escrowPubkey = creatorPubkey.toBase58();

    let postLaunchError: string | null = null;
    try {
      const baseRecord = createRewardCommitmentRecord({
        id: commitmentId,
        statement: statement || `Lock creator fees for ${name}. Ship milestones, release on-chain.`,
        creatorPubkey: payoutPubkey.toBase58(),
        escrowPubkey,
        escrowSecretKeyB58: `privy:${launchWalletId}`,
        milestones: [],
        tokenMint: tokenMintB58,
        creatorFeeMode: platform === "pumpfun" ? "managed" : "assisted",
      });

      const record = {
        ...baseRecord,
        authority: creatorPubkey.toBase58(),
        destinationOnFail: escrowPubkey,
      };

      stage = "insert_commitment";
      await insertCommitment(record);

      stage = "fetch_dev_buy_balance";
      if (devBuyLamports > 0 && tokenMintB58) {
      try {
        const mintPubkey = new PublicKey(tokenMintB58);
        const { getAssociatedTokenAddressSync } = await import("@solana/spl-token");
        const tokenProgramId = await getTokenProgramIdForMint({ connection, mint: mintPubkey });
        const treasuryAta = getAssociatedTokenAddressSync(mintPubkey, creatorPubkey, false, tokenProgramId);
        let tokenAmount = "0";
        for (let i = 0; i < 6; i++) {
          const ataInfo = await connection.getTokenAccountBalance(treasuryAta, "confirmed");
          tokenAmount = String(ataInfo?.value?.amount ?? "0");
          if (tokenAmount !== "0") break;
          await new Promise((r) => setTimeout(r, 1200));
        }
        if (tokenAmount !== "0") {
          await updateDevBuyTokenAmount({ commitmentId, devBuyTokenAmount: tokenAmount });
          await auditLog("launch_dev_buy_recorded", { commitmentId, tokenMint: tokenMintB58, devBuyTokenAmount: tokenAmount });
        }
      } catch (balanceErr) {
        await auditLog("launch_dev_buy_balance_error", { commitmentId, tokenMint: tokenMintB58, error: getSafeErrorMessage(balanceErr) });
      }
    }

      stage = "save_profile";
      try {
        await upsertProjectProfile({
          tokenMint: tokenMintB58,
          name: name || null,
          symbol: symbol || null,
          description: description || null,
          websiteUrl: websiteUrl || null,
          xUrl: xUrl || null,
          telegramUrl: telegramUrl || null,
          discordUrl: discordUrl || null,
          imageUrl: imageUrl || null,
          bannerUrl: bannerUrl || null,
          metadataUri: metadataUri || null,
          createdByWallet: payoutPubkey.toBase58(),
        });
      } catch (profileErr) {
        await auditLog("launch_profile_save_error", { commitmentId, tokenMint: tokenMintB58, error: getSafeErrorMessage(profileErr) });
      }

      await auditLog("launch_success", {
        commitmentId,
        tokenMint: tokenMintB58,
        payerWallet,
        payoutWallet: payoutPubkey.toBase58(),
        treasuryWallet,
        treasuryWalletId: walletId,
        launchCreatorWallet: creatorWallet,
        launchWalletId,
        requiredLamports,
        fundSignature,
        launchTxSig,
        vanityGenerationMs,
        vanitySource,
      });
    } catch (postErr) {
      const internal = getSafeErrorMessage(postErr);
      postLaunchError = IS_PROD
        ? "Your token launched successfully. We’re finishing a few setup steps in the background."
        : internal;
      try {
        await auditLog("launch_postchain_error", {
          stage,
          commitmentId,
          tokenMint: tokenMintB58,
          launchTxSig,
          error: internal,
        });
      } catch {
        // ignore
      }
    }

    return NextResponse.json({
      ok: true,
      platform,
      commitmentId,
      tokenMint: tokenMintB58,
      creatorWallet,
      payerWallet,
      treasuryWallet,
      launchWalletId,
      bondingCurve,
      creatorVault: creatorVaultPubkey,
      vanityGenerationMs,
      vanitySource,
      launchTxSig,
      metadataUri,
      escrowPubkey,
      postLaunchError,
    });
  } catch (e) {
    const msg = getSafeErrorMessage(e);
    const status = Number((e as any)?.status ?? 500);

    if (onchainOk && commitmentId && tokenMintB58 && launchTxSig) {
      await auditLog("launch_postchain_error", { stage, commitmentId, tokenMint: tokenMintB58, launchTxSig, error: msg });
      return NextResponse.json(
        {
          ok: true,
          platform,
          commitmentId,
          tokenMint: tokenMintB58,
          creatorWallet,
          payerWallet,
          treasuryWallet,
          launchWalletId,
          bondingCurve,
          creatorVault: creatorVaultPubkey,
          vanityGenerationMs,
          vanitySource,
          launchTxSig,
          metadataUri,
          escrowPubkey,
          postLaunchError: IS_PROD
            ? "Your token launched successfully. We’re finishing a few setup steps in the background."
            : msg,
        },
        { status: 200 }
      );
    }

    if (funded && launchWalletId && launchWalletId !== walletId && creatorPubkey && treasuryPubkey && !launchTxSig) {
      try {
        const refund = await privyRefundWalletToDestination({
          walletId: launchWalletId,
          fromPubkey: creatorPubkey,
          toPubkey: treasuryPubkey,
          caip2: SOLANA_CAIP2,
          keepLamports: 10_000,
        });
        await auditLog("launch_refund_attempt", {
          commitmentId,
          treasuryWalletId: walletId,
          launchWalletId,
          treasuryWallet,
          launchCreatorWallet: creatorWallet,
          fundedLamports,
          payerWallet,
          ok: refund.ok,
          refundSignature: refund.ok ? refund.signature : undefined,
          refundedLamports: refund.ok ? refund.refundedLamports : undefined,
          refundError: refund.ok ? undefined : refund.error,
        });
      } catch (refundErr) {
        await auditLog("launch_refund_attempt", {
          commitmentId,
          treasuryWalletId: walletId,
          launchWalletId,
          treasuryWallet,
          launchCreatorWallet: creatorWallet,
          fundedLamports,
          payerWallet,
          ok: false,
          refundError: getSafeErrorMessage(refundErr),
        });
      }
    }

    await auditLog("launch_error", { requestId, stage, commitmentId, walletId, creatorWallet, payerWallet, launchTxSig, error: msg });
    if (IS_PROD) {
      const publicMsg = status >= 500 && msg === "Service error" ? "Launch failed due to a server error. Please try again." : msg;
      const res = NextResponse.json({ error: publicMsg, requestId, stage }, { status: status });
      res.headers.set("x-request-id", requestId);
      return res;
    }
    const res = NextResponse.json({ error: msg, requestId, stage, commitmentId, walletId, creatorWallet, payerWallet, launchTxSig }, { status: status });
    res.headers.set("x-request-id", requestId);
    return res;
  }
}

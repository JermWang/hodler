import { NextResponse } from "next/server";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { Buffer } from "buffer";
import crypto from "crypto";

import { checkRateLimit } from "../../../lib/rateLimit";
import { getSafeErrorMessage } from "../../../lib/safeError";
import { getConnection } from "../../../lib/solana";
import { privyRefundWalletToDestination } from "../../../lib/privy";
import { getFeeShareWalletsV2Bulk, launchTokenViaBags, hasBagsApiKey } from "../../../lib/bags";
import { createRewardCommitmentRecord, insertCommitment, listCommitments } from "../../../lib/escrowStore";
import { upsertProjectProfile } from "../../../lib/projectProfilesStore";
import { auditLog } from "../../../lib/auditLog";
import { getAdminCookieName, getAdminSessionWallet, getAllowedAdminWallets, verifyAdminOrigin } from "../../../lib/adminSession";
import { verifyCreatorAuthOrThrow } from "../../../lib/creatorAuth";
import { getLaunchTreasuryWallet } from "../../../lib/launchTreasuryStore";

export const runtime = "nodejs";
export const maxDuration = 300;

const SOLANA_CAIP2 = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"; // mainnet
const IS_PROD = process.env.NODE_ENV === "production";

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
  let stage = "init";
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
  let bagsConfigKey = "";
  let escrowPubkey = "";
  let onchainOk = false;
  let creatorPubkey: PublicKey | null = null;
  let payerPubkey: PublicKey | null = null;
  let funded = false;
  let fundedLamports = 0;
  let fundSignature = "";
  let bagsDevTwitter = "";
  let bagsCreatorTwitter = "";
  let bagsDevWallet = "";
  let bagsCreatorWallet = "";
  let bagsDevBps: number | undefined;
  let bagsCreatorBps: number | undefined;
  let feeClaimersForLaunch: Array<{ walletPubkey: PublicKey; bps: number }> | undefined;

  try {
    const rl = await checkRateLimit(req, { keyPrefix: "launch:execute", limit: 10, windowSeconds: 60 });
    if (!rl.allowed) {
      const res = NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
      res.headers.set("retry-after", String(rl.retryAfterSeconds));
      return res;
    }

    verifyAdminOrigin(req);

    stage = "read_body";
    const body = (await req.json()) as any;

    payerWallet = typeof body?.payerWallet === "string" ? body.payerWallet.trim() : "";
    if (!payerWallet) return NextResponse.json({ error: "payerWallet is required" }, { status: 400 });
    try {
      payerPubkey = new PublicKey(payerWallet);
    } catch {
      return NextResponse.json({ error: "Invalid payer wallet address" }, { status: 400 });
    }

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
            hint: "Sign in with the payer wallet and retry.",
          },
          { status }
        );
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

    const bagsDevTwitterRaw = typeof body?.bagsDevTwitter === "string" ? body.bagsDevTwitter.trim() : "";
    const bagsCreatorTwitterRaw = typeof body?.bagsCreatorTwitter === "string" ? body.bagsCreatorTwitter.trim() : "";
    const bagsDevBpsRaw = body?.bagsDevBps;
    const bagsCreatorBpsRaw = body?.bagsCreatorBps;

    const devBuySolRaw = body.devBuySol;
    const devBuySolParsed = Number(devBuySolRaw ?? 0);
    const devBuySol = Number.isFinite(devBuySolParsed) && devBuySolParsed >= 0 ? devBuySolParsed : 0;
    const devBuyLamports = Math.floor(devBuySol * 1_000_000_000);
    const requiredLamports = devBuyLamports + 10_000_000;

    if (!walletId) return NextResponse.json({ error: "walletId is required" }, { status: 400 });
    if (!treasuryWallet) return NextResponse.json({ error: "treasuryWallet is required" }, { status: 400 });
    if (!payerWallet) return NextResponse.json({ error: "payerWallet is required" }, { status: 400 });

    stage = "verify_launch_treasury_wallet";
    const treasuryRecord = await getLaunchTreasuryWallet(payerPubkey.toBase58());
    if (!treasuryRecord) {
      return NextResponse.json(
        {
          error: "Launch treasury wallet not found",
          hint: "Call /api/launch/prepare first.",
        },
        { status: 409 }
      );
    }
    if (treasuryRecord.walletId !== walletId || treasuryRecord.treasuryWallet !== treasuryWallet) {
      await auditLog("launch_execute_denied_wallet_mismatch", {
        payerWallet,
        expectedWalletId: treasuryRecord.walletId,
        expectedTreasuryWallet: treasuryRecord.treasuryWallet,
        walletId,
        treasuryWallet,
      });
      return NextResponse.json({ error: "Invalid launch wallet" }, { status: 400 });
    }

    if (!name) return NextResponse.json({ error: "Token name is required" }, { status: 400 });
    if (!symbol) return NextResponse.json({ error: "Token symbol is required" }, { status: 400 });
    if (!imageUrl) return NextResponse.json({ error: "Token image is required" }, { status: 400 });
    if (!payoutWallet) return NextResponse.json({ error: "Payout wallet is required" }, { status: 400 });

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
    const existingManaged = (await listCommitments()).find(
      (c) => c.kind === "creator_reward" && c.creatorFeeMode === "managed" && c.status !== "archived" && c.authority === creatorWalletPubkey
    );
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

    // Check Bags API key is configured
    if (!hasBagsApiKey()) {
      throw Object.assign(new Error("BAGS_API_KEY environment variable is required for token launches"), { status: 503 });
    }

    const wantsCustomFeeSplit =
      Boolean(bagsDevTwitterRaw) ||
      Boolean(bagsCreatorTwitterRaw) ||
      bagsDevBpsRaw != null ||
      bagsCreatorBpsRaw != null;

    if (wantsCustomFeeSplit) {
      stage = "resolve_fee_share_wallets";

      bagsDevTwitter = normalizeTwitterUsername(bagsDevTwitterRaw);
      bagsCreatorTwitter = normalizeTwitterUsername(bagsCreatorTwitterRaw);

      if (!bagsDevTwitter) return NextResponse.json({ error: "bagsDevTwitter is required" }, { status: 400 });
      if (!bagsCreatorTwitter) return NextResponse.json({ error: "bagsCreatorTwitter is required" }, { status: 400 });

      const devBpsParsed = parseBps(bagsDevBpsRaw);
      const creatorBpsParsed = parseBps(bagsCreatorBpsRaw);
      if (devBpsParsed == null) return NextResponse.json({ error: "bagsDevBps must be an integer between 0 and 10000" }, { status: 400 });
      if (creatorBpsParsed == null) return NextResponse.json({ error: "bagsCreatorBps must be an integer between 0 and 10000" }, { status: 400 });

      if (devBpsParsed + creatorBpsParsed !== 5000) {
        return NextResponse.json({ error: "bagsDevBps + bagsCreatorBps must equal 5000" }, { status: 400 });
      }

      bagsDevBps = devBpsParsed;
      bagsCreatorBps = creatorBpsParsed;

      const lookup = await getFeeShareWalletsV2Bulk([
        { provider: "twitter", username: bagsDevTwitter },
        { provider: "twitter", username: bagsCreatorTwitter },
      ]);

      if (!lookup.ok) {
        throw Object.assign(new Error(`Failed to resolve fee-share wallets: ${lookup.error}`), { status: 502 });
      }

      const byUsername = new Map<string, string>();
      for (const r of lookup.results) {
        const u = normalizeTwitterUsername(String(r?.username ?? ""));
        const w = String(r?.wallet ?? "").trim();
        if (!u || !w) continue;
        byUsername.set(u.toLowerCase(), w);
      }

      bagsDevWallet = String(byUsername.get(bagsDevTwitter.toLowerCase()) ?? "").trim();
      bagsCreatorWallet = String(byUsername.get(bagsCreatorTwitter.toLowerCase()) ?? "").trim();

      if (!bagsDevWallet) {
        return NextResponse.json({ error: "bagsDevTwitter is not linked to a wallet on Bags" }, { status: 400 });
      }
      if (!bagsCreatorWallet) {
        return NextResponse.json({ error: "bagsCreatorTwitter is not linked to a wallet on Bags" }, { status: 400 });
      }

      let devWalletPk: PublicKey;
      let creatorWalletPk: PublicKey;
      try {
        devWalletPk = new PublicKey(bagsDevWallet);
      } catch {
        return NextResponse.json({ error: "Invalid Bags dev wallet address" }, { status: 400 });
      }
      try {
        creatorWalletPk = new PublicKey(bagsCreatorWallet);
      } catch {
        return NextResponse.json({ error: "Invalid Bags creator wallet address" }, { status: 400 });
      }

      const merged = new Map<string, { walletPubkey: PublicKey; bps: number }>();
      const push = (pk: PublicKey, bps: number) => {
        if (bps <= 0) return;
        const key = pk.toBase58();
        const existing = merged.get(key);
        merged.set(key, { walletPubkey: pk, bps: (existing?.bps ?? 0) + bps });
      };

      push(devWalletPk, devBpsParsed);
      push(creatorWalletPk, creatorBpsParsed);

      feeClaimersForLaunch = Array.from(merged.values());
    }

    stage = "prepare_description";
    const BAGS_DESCRIPTION_MAX = 600;
    const ATTRIBUTION = "Launched with AmpliFi";

    const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const withAttribution = (raw: string): string => {
      const trimmed = String(raw ?? "").trim();
      const cleaned = trimmed.replace(new RegExp(`\\s*${escapeRegExp(ATTRIBUTION)}\\s*`, "gi"), "").trim();
      const delim = cleaned.length ? "\n\n" : "";
      const reserved = ATTRIBUTION.length + delim.length;
      const baseMax = Math.max(0, BAGS_DESCRIPTION_MAX - reserved);
      const base = cleaned.slice(0, baseMax).trimEnd();
      const out = (base ? base + delim : "") + ATTRIBUTION;
      return out.length <= BAGS_DESCRIPTION_MAX ? out : ATTRIBUTION;
    };

    const bagsDescription = withAttribution(description);

    commitmentId = crypto.randomBytes(16).toString("hex");

    stage = "audit_attempt";
    await auditLog("launch_attempt", {
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
      bagsDevTwitter: bagsDevTwitter || null,
      bagsCreatorTwitter: bagsCreatorTwitter || null,
      bagsDevBps: bagsDevBps ?? null,
      bagsCreatorBps: bagsCreatorBps ?? null,
      platform: "bags",
    });

    stage = "launch_via_bags";
    // Launch token via Bags API with Privy wallet signing
    // Fee shares: 100% to the creator/campaign pool wallet (managed by AmpliFi)
    const bagsResult = await launchTokenViaBags({
      name,
      symbol,
      description: bagsDescription,
      imageUrl,
      twitterUrl: xUrl || undefined,
      websiteUrl: websiteUrl || undefined,
      telegramUrl: telegramUrl || undefined,
      initialBuyLamports: devBuyLamports,
      privyWalletId: launchWalletId,
      launchWalletPubkey: creatorPubkey,
      // All fees go to the launch wallet (managed by AmpliFi for campaigns)
      // AmpliFi will update fee shares dynamically based on holder engagement
      feeClaimers: feeClaimersForLaunch,
    });

    tokenMintB58 = bagsResult.tokenMint;
    metadataUri = bagsResult.metadataUri;
    bagsConfigKey = bagsResult.configKey;
    launchTxSig = bagsResult.launchSignature;

    await auditLog("launch_onchain_success", {
      commitmentId,
      tokenMint: tokenMintB58,
      launchTxSig,
      treasuryWallet,
      treasuryWalletId: walletId,
      launchCreatorWallet: creatorWallet,
      launchWalletId,
      bagsConfigKey,
      platform: "bags",
    });

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
        creatorFeeMode: "managed",
        bagsDevTwitter: bagsDevTwitter || undefined,
        bagsCreatorTwitter: bagsCreatorTwitter || undefined,
        bagsDevWallet: bagsDevWallet || undefined,
        bagsCreatorWallet: bagsCreatorWallet || undefined,
        bagsDevBps,
        bagsCreatorBps,
      });

      const record = {
        ...baseRecord,
        authority: creatorPubkey.toBase58(),
        destinationOnFail: escrowPubkey,
      };

      stage = "insert_commitment";
      await insertCommitment(record);

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
      commitmentId,
      tokenMint: tokenMintB58,
      creatorWallet,
      payerWallet,
      treasuryWallet,
      launchWalletId,
      bagsConfigKey,
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
          commitmentId,
          tokenMint: tokenMintB58,
          creatorWallet,
          payerWallet,
          treasuryWallet,
          launchWalletId,
          bagsConfigKey,
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

    await auditLog("launch_error", { stage, commitmentId, walletId, creatorWallet, payerWallet, launchTxSig, error: msg });
    if (IS_PROD) {
      const publicMsg = status >= 500 ? "Launch failed due to a server error. Please try again." : msg;
      return NextResponse.json({ error: publicMsg }, { status: status });
    }
    return NextResponse.json({ error: msg, stage, commitmentId, walletId, creatorWallet, payerWallet, launchTxSig }, { status: status });
  }
}

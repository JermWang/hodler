import { NextResponse } from "next/server";
import { Connection, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { Buffer } from "buffer";

import { checkRateLimit } from "../../../lib/rateLimit";
import { getSafeErrorMessage } from "../../../lib/safeError";
import { withRpcFallback } from "../../../lib/rpc";
import { getOrCreateLaunchTreasuryWallet } from "../../../lib/launchTreasuryStore";
import { auditLog } from "../../../lib/auditLog";
import { getAdminCookieName, getAdminSessionWallet, getAllowedAdminWallets, verifyAdminOrigin } from "../../../lib/adminSession";
import { verifyCreatorAuthOrThrow } from "../../../lib/creatorAuth";
import { withTraceJson } from "../../../lib/trace";

export const runtime = "nodejs";

const LAUNCH_OVERHEAD_LAMPORTS = 30_000_000; // 0.03 SOL
const LAUNCH_RENT_FEE_BUFFER_LAMPORTS = 5_000_000;
const MAX_FUNDING_LAMPORTS = 500_000_000; // 0.5 SOL max safety cap (excluding dev buy)
const RENT_EXEMPT_FALLBACK = 890_880;
const RENT_EXEMPT_CACHE_TTL_MS = 5 * 60 * 1000;

let cachedRentExemptMin: { value: number; expiresAt: number } | null = null;

async function getCachedRentExemptMin(connection: Connection): Promise<number> {
  const now = Date.now();
  if (cachedRentExemptMin && cachedRentExemptMin.expiresAt > now) {
    return cachedRentExemptMin.value;
  }

  const raw = await connection.getMinimumBalanceForRentExemption(0);
  const value = Number.isFinite(raw) && raw > 0 ? raw : RENT_EXEMPT_FALLBACK;
  cachedRentExemptMin = { value, expiresAt: now + RENT_EXEMPT_CACHE_TTL_MS };
  return value;
}

function isPublicLaunchEnabled(): boolean {
  // Public launches enabled by default (closed beta ended)
  const raw = String(process.env.AMPLIFI_PUBLIC_LAUNCHES ?? "true").trim().toLowerCase();
  return raw !== "0" && raw !== "false" && raw !== "no" && raw !== "off";
}

export async function GET() {
  const res = NextResponse.json({ error: "Method Not Allowed. Use POST /api/launch/prepare." }, { status: 405 });
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
  try {
    const json = (body: Record<string, unknown>, init?: ResponseInit) => withTraceJson(req, body, init);
    const rl = await checkRateLimit(req, { keyPrefix: "launch:prepare", limit: 10, windowSeconds: 60 });
    if (!rl.allowed) {
      const res = json({ error: "Rate limit exceeded" }, { status: 429 });
      res.headers.set("retry-after", String(rl.retryAfterSeconds));
      return res;
    }

    verifyAdminOrigin(req);

    const body = (await req.json().catch(() => null)) as any;

    const payerWallet = typeof body?.payerWallet === "string" ? body.payerWallet.trim() : "";
    const devBuySolParsed = Number(body?.devBuySol ?? 0);
    const devBuySol = Number.isFinite(devBuySolParsed) && devBuySolParsed >= 0 ? devBuySolParsed : 0;

    if (!payerWallet) return json({ error: "payerWallet is required" }, { status: 400 });

    let payerPubkey: PublicKey;
    try {
      payerPubkey = new PublicKey(payerWallet);
    } catch {
      return json({ error: "Invalid payer wallet address" }, { status: 400 });
    }

    if (!isPublicLaunchEnabled()) {
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
          await auditLog("launch_prepare_denied", { hasAdminCookie, adminWallet: adminWallet ?? null, error: msg });
          const status = msg.toLowerCase().includes("not approved") ? 403 : 401;
          return json(
            {
              error: msg,
              hint: "If you're part of the closed beta, ask to be added to AMPLIFI_CREATOR_WALLET_PUBKEYS.",
            },
            { status }
          );
        }
      }
    }
    const { record: treasury, created } = await getOrCreateLaunchTreasuryWallet({ payerWallet: payerPubkey.toBase58() });
    const walletId = treasury.walletId;
    const treasuryWallet = treasury.treasuryWallet;
    const treasuryPubkey = new PublicKey(treasuryWallet);

    const devBuyLamports = Math.floor(devBuySol * 1_000_000_000);
    const requiredLamports = devBuyLamports + LAUNCH_OVERHEAD_LAMPORTS + LAUNCH_RENT_FEE_BUFFER_LAMPORTS;
    const balanceBufferLamports = 50_000;

    const rpcValues = await withRpcFallback(async (connection) => {
      const rentExemptMin = await getCachedRentExemptMin(connection);
      const currentLamports = await connection.getBalance(treasuryPubkey, "confirmed");
      const rawMissingLamports = Math.max(0, requiredLamports + balanceBufferLamports + rentExemptMin - currentLamports);
      let blockhash = "";
      let lastValidBlockHeight = 0;

      if (rawMissingLamports > 0) {
        const latest = await connection.getLatestBlockhash("confirmed");
        blockhash = latest.blockhash;
        lastValidBlockHeight = latest.lastValidBlockHeight;
      }

      return { rentExemptMin, currentLamports, rawMissingLamports, blockhash, lastValidBlockHeight };
    });

    const currentLamports = rpcValues.currentLamports;
    const rawMissingLamports = rpcValues.rawMissingLamports;
    
    // Safety cap: never ask for more than MAX_FUNDING_LAMPORTS + devBuyLamports
    const maxAllowed = MAX_FUNDING_LAMPORTS + devBuyLamports;
    if (rawMissingLamports > maxAllowed) {
      await auditLog("launch_prepare_excessive_funding", {
        rawMissingLamports,
        maxAllowed,
        devBuyLamports,
        requiredLamports,
        currentLamports,
      });
      return json(
        { error: `Funding amount too high (${(rawMissingLamports / 1e9).toFixed(4)} SOL). Max allowed: ${(maxAllowed / 1e9).toFixed(4)} SOL` },
        { status: 400 }
      );
    }
    
    const missingLamports = rawMissingLamports;
    const needsFunding = missingLamports > 0;

    let txBase64: string | null = null;
    let blockhash = rpcValues.blockhash;
    let lastValidBlockHeight = rpcValues.lastValidBlockHeight;

    if (needsFunding) {
      const tx = new Transaction();
      tx.feePayer = payerPubkey;
      tx.recentBlockhash = blockhash;
      tx.lastValidBlockHeight = lastValidBlockHeight;
      tx.add(
        SystemProgram.transfer({
          fromPubkey: payerPubkey,
          toPubkey: treasuryPubkey,
          lamports: missingLamports,
        })
      );

      const txBytes = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
      txBase64 = Buffer.from(Uint8Array.from(txBytes)).toString("base64");
    }

    await auditLog("launch_prepare", {
      walletId,
      treasuryWallet,
      payerWallet: payerPubkey.toBase58(),
      requiredLamports,
      currentLamports,
      missingLamports,
      needsFunding,
      createdTreasury: created,
      devBuySol,
    });

    return json({
      ok: true,
      walletId,
      treasuryWallet,
      payerWallet: payerPubkey.toBase58(),
      requiredLamports,
      currentLamports,
      missingLamports,
      needsFunding,
      txBase64,
      txFormat: txBase64 ? "base64" : null,
      txType: txBase64 ? "fund_treasury_wallet" : null,
      blockhash: blockhash || null,
      lastValidBlockHeight: lastValidBlockHeight || null,
    });
  } catch (e) {
    await auditLog("launch_prepare_error", { error: getSafeErrorMessage(e) });
    return withTraceJson(req, { error: getSafeErrorMessage(e) }, { status: 500 });
  }
}

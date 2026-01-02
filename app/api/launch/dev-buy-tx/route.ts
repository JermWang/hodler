import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { Buffer } from "buffer";

import { checkRateLimit } from "../../../lib/rateLimit";
import { auditLog } from "../../../lib/auditLog";
import { getSafeErrorMessage } from "../../../lib/safeError";
import { getConnection } from "../../../lib/solana";
import { buildUnsignedPumpfunBuyTx } from "../../../lib/pumpfun";
import { getAdminCookieName, getAdminSessionWallet, getAllowedAdminWallets, verifyAdminOrigin } from "../../../lib/adminSession";

export const runtime = "nodejs";

function isPublicLaunchEnabled(): boolean {
  const raw = String(process.env.CTS_PUBLIC_LAUNCHES ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export async function GET() {
  const res = NextResponse.json({ error: "Method Not Allowed. Use POST /api/launch/dev-buy-tx." }, { status: 405 });
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
    const rl = await checkRateLimit(req, { keyPrefix: "launch:devBuy", limit: 20, windowSeconds: 60 });
    if (!rl.allowed) {
      const res = NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
      res.headers.set("retry-after", String(rl.retryAfterSeconds));
      return res;
    }

    verifyAdminOrigin(req);

    if (!isPublicLaunchEnabled()) {
      const cookieHeader = String(req.headers.get("cookie") ?? "");
      const hasAdminCookie = cookieHeader.includes(`${getAdminCookieName()}=`);
      const allowed = getAllowedAdminWallets();
      const adminWallet = await getAdminSessionWallet(req);

      if (!adminWallet) {
        await auditLog("admin_launch_devbuy_denied", { hasAdminCookie });
        return NextResponse.json(
          {
            error: hasAdminCookie ? "Admin session not found or expired. Try Admin Sign-In again." : "Admin Sign-In required",
          },
          { status: 401 }
        );
      }

      if (!allowed.has(adminWallet)) {
        await auditLog("admin_launch_devbuy_denied", { adminWallet });
        return NextResponse.json({ error: "Not an allowed admin wallet" }, { status: 401 });
      }
    }

    const body = (await req.json().catch(() => ({}))) as any;

    const payerWallet = typeof body?.payerWallet === "string" ? body.payerWallet.trim() : "";
    const tokenMint = typeof body?.tokenMint === "string" ? body.tokenMint.trim() : "";
    const creatorWallet = typeof body?.creatorWallet === "string" ? body.creatorWallet.trim() : "";

    const devBuySolParsed = Number(body?.devBuySol ?? 0);
    const devBuySol = Number.isFinite(devBuySolParsed) && devBuySolParsed > 0 ? devBuySolParsed : 0;

    if (!payerWallet) return NextResponse.json({ error: "payerWallet is required" }, { status: 400 });
    if (!tokenMint) return NextResponse.json({ error: "tokenMint is required" }, { status: 400 });
    if (!creatorWallet) return NextResponse.json({ error: "creatorWallet is required" }, { status: 400 });

    if (devBuySol <= 0) {
      return NextResponse.json({ ok: true, devBuySol: 0, txBase64: null, txFormat: null });
    }

    let payerPubkey: PublicKey;
    let mintPubkey: PublicKey;
    let creatorPubkey: PublicKey;
    try {
      payerPubkey = new PublicKey(payerWallet);
      mintPubkey = new PublicKey(tokenMint);
      creatorPubkey = new PublicKey(creatorWallet);
    } catch {
      return NextResponse.json({ error: "Invalid payerWallet/tokenMint/creatorWallet" }, { status: 400 });
    }

    const devBuyLamports = Math.floor(devBuySol * 1_000_000_000);
    if (!Number.isFinite(devBuyLamports) || devBuyLamports <= 0) {
      return NextResponse.json({ error: "devBuySol is invalid" }, { status: 400 });
    }

    const connection = getConnection();
    const { tx } = await buildUnsignedPumpfunBuyTx({
      connection,
      user: payerPubkey,
      mint: mintPubkey,
      creator: creatorPubkey,
      spendableSolInLamports: BigInt(devBuyLamports),
      minTokensOut: 0n,
      computeUnitLimit: 300_000,
      computeUnitPriceMicroLamports: 100_000,
    });

    const txBytes = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
    const txBase64 = Buffer.from(Uint8Array.from(txBytes)).toString("base64");

    await auditLog("launch_devbuy_tx", {
      payerWallet,
      tokenMint,
      creatorWallet,
      devBuySol,
      devBuyLamports,
    });

    return NextResponse.json({ ok: true, devBuySol, devBuyLamports, txBase64, txFormat: "base64" });
  } catch (e) {
    const msg = getSafeErrorMessage(e);
    await auditLog("launch_devbuy_tx_error", { error: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

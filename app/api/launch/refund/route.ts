import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";

import { checkRateLimit } from "../../../lib/rateLimit";
import { auditLog } from "../../../lib/auditLog";
import { getSafeErrorMessage } from "../../../lib/safeError";
import { getAdminCookieName, getAdminSessionWallet, getAllowedAdminWallets, verifyAdminOrigin } from "../../../lib/adminSession";
import { verifyCreatorAuthOrThrow } from "../../../lib/creatorAuth";
import { getConnection } from "../../../lib/solana";
import { getPool, hasDatabase } from "../../../lib/db";
import { privyFindSolanaWalletIdByAddress, privyRefundWalletToDestination } from "../../../lib/privy";

export const runtime = "nodejs";

const SOLANA_CAIP2 = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"; // mainnet

export async function GET() {
  const res = NextResponse.json({ error: "Method Not Allowed. Use POST /api/launch/refund." }, { status: 405 });
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

async function requireAdminOrCreator(req: Request, body: any): Promise<{ ok: true; wallet: string; method: "admin" | "creator" } | { ok: false; res: NextResponse }> {
  verifyAdminOrigin(req);

  // First try admin session
  const cookieHeader = String(req.headers.get("cookie") ?? "");
  const hasAdminCookie = cookieHeader.includes(`${getAdminCookieName()}=`);
  const allowed = getAllowedAdminWallets();
  const adminWallet = await getAdminSessionWallet(req);

  if (adminWallet && allowed.has(adminWallet)) {
    return { ok: true, wallet: adminWallet, method: "admin" };
  }

  // Try creator auth (wallet signature)
  const payerWallet = typeof body?.payerWallet === "string" ? body.payerWallet.trim() : "";
  if (body?.creatorAuth && payerWallet) {
    try {
      verifyCreatorAuthOrThrow({
        payload: body.creatorAuth,
        action: "launch_refund",
        expectedWalletPubkey: payerWallet,
        maxSkewSeconds: 5 * 60,
      });
      return { ok: true, wallet: payerWallet, method: "creator" };
    } catch (e) {
      const msg = (e as Error)?.message ?? String(e);
      await auditLog("launch_refund_creator_auth_failed", { payerWallet, error: msg });
    }
  }

  await auditLog("launch_refund_denied", { hasAdminCookie, adminWallet: adminWallet ?? null });
  return {
    ok: false,
    res: NextResponse.json(
      {
        error: "Authorization required. Sign a message with your wallet or use admin session.",
        hint: "Include creatorAuth with walletPubkey, signatureB58, timestampUnix",
      },
      { status: 401 }
    ),
  };
}

function extractSystemTransferParties(parsedTx: any): { source: string; destination: string; lamports: number } | null {
  const ixs = (parsedTx?.transaction?.message?.instructions ?? []) as any[];
  const transfer = ixs.find((ix) => ix?.program === "system" && ix?.parsed?.type === "transfer");
  const info = transfer?.parsed?.info;
  const source = typeof info?.source === "string" ? info.source : "";
  const destination = typeof info?.destination === "string" ? info.destination : "";
  const lamports = Number(info?.lamports ?? 0);
  if (!source || !destination || !Number.isFinite(lamports) || lamports <= 0) return null;
  return { source, destination, lamports };
}

export async function POST(req: Request) {
  try {
    const rl = await checkRateLimit(req, { keyPrefix: "launch:refund", limit: 10, windowSeconds: 60 });
    if (!rl.allowed) {
      const res = NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
      res.headers.set("retry-after", String(rl.retryAfterSeconds));
      return res;
    }

    const body = (await req.json().catch(() => ({}))) as any;

    const auth = await requireAdminOrCreator(req, body);
    if (!auth.ok) return auth.res;

    const keepLamportsRaw = body?.keepLamports != null ? Number(body.keepLamports) : 10_000;
    const keepLamports = Math.max(5_000, Math.floor(Number.isFinite(keepLamportsRaw) ? keepLamportsRaw : 10_000));

    let walletId = typeof body?.walletId === "string" ? body.walletId.trim() : "";
    let creatorWallet = typeof body?.creatorWallet === "string" ? body.creatorWallet.trim() : "";
    let payerWallet = typeof body?.payerWallet === "string" ? body.payerWallet.trim() : "";

    const fundingSig = typeof body?.fundingSig === "string" ? body.fundingSig.trim() : "";

    if ((!creatorWallet || !payerWallet) && !fundingSig) {
      return NextResponse.json(
        { error: "Provide either (creatorWallet, payerWallet) or fundingSig" },
        { status: 400 }
      );
    }

    if ((!creatorWallet || !payerWallet) && fundingSig) {

      const connection = getConnection();
      const parsed = await connection.getParsedTransaction(fundingSig, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      } as any);

      if (!parsed) {
        return NextResponse.json({ error: "Funding transaction not found/confirmed" }, { status: 400 });
      }

      const parties = extractSystemTransferParties(parsed);
      if (!parties) {
        return NextResponse.json({ error: "Funding transaction is not a simple SystemProgram transfer" }, { status: 400 });
      }

      // For a payer->treasury top-up, this sets payerWallet=source, creatorWallet=destination.
      // For a treasury->launch-wallet funding transfer, this sets creatorWallet=destination.
      // If caller provided payerWallet explicitly, keep it so they can refund directly back to their wallet.
      if (!payerWallet) payerWallet = parties.source;
      if (!creatorWallet) creatorWallet = parties.destination;

      if (hasDatabase()) {
        const pool = getPool();
        const { rows } = await pool.query(
          `
          select
            fields->>'walletId' as wallet_id,
            fields->>'treasuryWallet' as treasury_wallet,
            fields->>'payerWallet' as payer_wallet,
            ts_unix
          from public.audit_logs
          where event = 'launch_prepare'
            and fields->>'treasuryWallet' = $1
            and fields->>'payerWallet' = $2
          order by ts_unix desc
          limit 1
          `,
          [creatorWallet, payerWallet]
        );

        const row = rows?.[0];
        walletId = String(row?.wallet_id ?? "").trim();
      }
    }

    // If caller didn't provide walletId, try to resolve it from the Privy wallet address.
    if (!walletId && creatorWallet) {
      const wid = await privyFindSolanaWalletIdByAddress({ address: creatorWallet, maxPages: 20 });
      walletId = wid || "";
    }

    if (!walletId || !creatorWallet || !payerWallet) {
      return NextResponse.json(
        {
          error: "Missing required fields after resolution",
          walletId: walletId || null,
          creatorWallet: creatorWallet || null,
          payerWallet: payerWallet || null,
        },
        { status: 400 }
      );
    }

    const fromPubkey = new PublicKey(creatorWallet);
    const toPubkey = new PublicKey(payerWallet);

    const refund = await privyRefundWalletToDestination({
      walletId,
      fromPubkey,
      toPubkey,
      caip2: SOLANA_CAIP2,
      keepLamports,
    });

    await auditLog("launch_refund_manual", {
      walletId,
      creatorWallet,
      payerWallet,
      keepLamports,
      ok: refund.ok,
      refundSignature: refund.ok ? refund.signature : undefined,
      refundedLamports: refund.ok ? refund.refundedLamports : undefined,
      refundError: refund.ok ? undefined : refund.error,
      fundingSig: fundingSig || undefined,
    });

    return NextResponse.json({ ok: true, walletId, creatorWallet, payerWallet, refund });
  } catch (e) {
    const msg = getSafeErrorMessage(e);
    await auditLog("launch_refund_error", { error: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { Keypair, PublicKey } from "@solana/web3.js";
import { Buffer } from "buffer";

import { isAdminRequestAsync } from "../../../lib/adminAuth";
import { verifyAdminOrigin } from "../../../lib/adminSession";
import { checkRateLimit } from "../../../lib/rateLimit";
import { auditLog } from "../../../lib/auditLog";
import { upsertProjectProfile } from "../../../lib/projectProfilesStore";
import { getConnection, getSolanaCaip2 } from "../../../lib/solana";
import { buildUnsignedPumpfunCreateV2Tx } from "../../../lib/pumpfun";
import { privySignAndSendSolanaTransaction } from "../../../lib/privy";
import { getSafeErrorMessage } from "../../../lib/safeError";
import { generateVanityKeypairAsync } from "../../../lib/vanityKeypair";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes max for vanity keypair generation

function parseBigIntLike(value: unknown): bigint | null {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value) && Number.isInteger(value)) return BigInt(value);
  if (typeof value === "string" && value.trim().length) {
    try {
      return BigInt(value.trim());
    } catch {
      return null;
    }
  }
  return null;
}

export async function POST(req: Request) {
  try {
    const rl = await checkRateLimit(req, { keyPrefix: "pumpfun:launch", limit: 10, windowSeconds: 60 });
    if (!rl.allowed) {
      const res = NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
      res.headers.set("retry-after", String(rl.retryAfterSeconds));
      return res;
    }

    verifyAdminOrigin(req);
    if (!(await isAdminRequestAsync(req))) {
      await auditLog("admin_pumpfun_launch_denied", {});
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as any;

    const walletId = typeof body?.walletId === "string" ? body.walletId.trim() : "";
    const walletPubkeyRaw = typeof body?.walletPubkey === "string" ? body.walletPubkey.trim() : "";

    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const symbol = typeof body?.symbol === "string" ? body.symbol.trim() : "";
    const uri = typeof body?.uri === "string" ? body.uri.trim() : "";

    const creatorPubkeyRaw = typeof body?.creatorPubkey === "string" ? body.creatorPubkey.trim() : "";
    const isMayhemMode = Boolean(body?.isMayhemMode);

    const spendableSolInLamports = parseBigIntLike(body?.spendableSolInLamports);
    const minTokensOut = parseBigIntLike(body?.minTokensOut);

    const computeUnitLimit = body?.computeUnitLimit != null ? Number(body.computeUnitLimit) : undefined;
    const computeUnitPriceMicroLamports = body?.computeUnitPriceMicroLamports != null ? Number(body.computeUnitPriceMicroLamports) : undefined;

    if (!walletId) return NextResponse.json({ error: "walletId is required" }, { status: 400 });
    if (!walletPubkeyRaw) return NextResponse.json({ error: "walletPubkey is required" }, { status: 400 });

    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
    if (!symbol) return NextResponse.json({ error: "symbol is required" }, { status: 400 });
    if (!uri) return NextResponse.json({ error: "uri is required" }, { status: 400 });

    if (name.length > 32) return NextResponse.json({ error: "name too long" }, { status: 400 });
    if (symbol.length > 10) return NextResponse.json({ error: "symbol too long" }, { status: 400 });
    if (uri.length > 200) return NextResponse.json({ error: "uri too long" }, { status: 400 });
    if (!/^https?:\/\//i.test(uri)) return NextResponse.json({ error: "uri must be http(s)" }, { status: 400 });

    if (spendableSolInLamports == null || spendableSolInLamports <= 0n) {
      return NextResponse.json({ error: "spendableSolInLamports must be a positive integer" }, { status: 400 });
    }

    const user = new PublicKey(walletPubkeyRaw);
    const creator = creatorPubkeyRaw ? new PublicKey(creatorPubkeyRaw) : user;

    // Check if vanity address is requested (default: true for "pump" suffix)
    const useVanity = body?.useVanity !== false;
    const vanitySuffix = typeof body?.vanitySuffix === "string" ? body.vanitySuffix.trim() : "AMP";
    const vanityMaxAttempts = typeof body?.vanityMaxAttempts === "number" ? body.vanityMaxAttempts : 50_000_000;

    let mintKeypair: Keypair;
    
    if (useVanity && vanitySuffix) {
      await auditLog("admin_pumpfun_launch_vanity_start", { suffix: vanitySuffix });

      const suffixLower = vanitySuffix.toLowerCase();
      const suffixUpper = vanitySuffix.toUpperCase();
      if (suffixLower === "pump" && vanitySuffix !== "pump") {
        return NextResponse.json({ error: 'vanitySuffix "pump" must be lowercase' }, { status: 400 });
      }
      if (suffixUpper === "AMP" && vanitySuffix !== "AMP") {
        return NextResponse.json({ error: 'vanitySuffix "AMP" must be uppercase' }, { status: 400 });
      }
      const caseSensitive = suffixLower === "pump" || suffixUpper === "AMP";
      
      const vanityKeypair = await generateVanityKeypairAsync(vanitySuffix, vanityMaxAttempts, undefined, { caseSensitive });
      if (!vanityKeypair) {
        return NextResponse.json({ 
          error: `Failed to generate vanity address with suffix "${vanitySuffix}" after ${vanityMaxAttempts} attempts` 
        }, { status: 500 });
      }
      mintKeypair = vanityKeypair;
      
      await auditLog("admin_pumpfun_launch_vanity_found", { 
        suffix: vanitySuffix, 
        mint: mintKeypair.publicKey.toBase58() 
      });
    } else {
      // Use random keypair if vanity not requested
      mintKeypair = Keypair.generate();
    }

    const connection = getConnection();

    const built = await buildUnsignedPumpfunCreateV2Tx({
      connection,
      user,
      mint: mintKeypair.publicKey,
      name,
      symbol,
      uri,
      creator,
      isMayhemMode,
      spendableSolInLamports,
      minTokensOut: minTokensOut ?? BigInt(1),
      computeUnitLimit,
      computeUnitPriceMicroLamports,
    });

    built.tx.partialSign(mintKeypair);

    const txBytes = built.tx.serialize({ requireAllSignatures: false, verifySignatures: false });
    const txBase64 = Buffer.from(Uint8Array.from(txBytes)).toString("base64");

    const sent = await privySignAndSendSolanaTransaction({
      walletId,
      caip2: getSolanaCaip2(),
      transactionBase64: txBase64,
    });

    const signature = sent.signature;

    await auditLog("admin_pumpfun_launch_sent", {
      signature,
      mint: mintKeypair.publicKey.toBase58(),
      creator: creator.toBase58(),
      walletId,
      user: user.toBase58(),
    });

    await upsertProjectProfile({
      tokenMint: mintKeypair.publicKey.toBase58(),
      name,
      symbol,
      metadataUri: uri,
      createdByWallet: creator.toBase58(),
    });

    return NextResponse.json({
      ok: true,
      signature,
      explorerUrl: `https://solscan.io/tx/${encodeURIComponent(signature)}`,
      mint: mintKeypair.publicKey.toBase58(),
      bondingCurve: built.bondingCurve.toBase58(),
      associatedBondingCurve: built.associatedBondingCurve.toBase58(),
      associatedUser: built.associatedUser.toBase58(),
      feeRecipient: built.feeRecipient.toBase58(),
      creator: creator.toBase58(),
    });
  } catch (e) {
    await auditLog("admin_pumpfun_launch_error", { error: getSafeErrorMessage(e) });
    return NextResponse.json({ error: getSafeErrorMessage(e) }, { status: 500 });
  }
}

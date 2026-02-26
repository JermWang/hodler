import { NextResponse } from "next/server";
import { Keypair, PublicKey } from "@solana/web3.js";
import { Buffer } from "buffer";

import { isAdminRequestAsync } from "../../../lib/adminAuth";
import { verifyAdminOrigin } from "../../../lib/adminSession";
import { checkRateLimit } from "../../../lib/rateLimit";
import { auditLog } from "../../../lib/auditLog";
import { upsertProjectProfile } from "../../../lib/projectProfilesStore";
import { getConnection, getSolanaCaip2 } from "../../../lib/solana";
import { getBondingCurvePda, getAssociatedTokenAddress, getGlobalFeeRecipient, getCreatorVaultPda } from "../../../lib/pumpfun";
import { privySignAndSendSolanaTransaction } from "../../../lib/privy";
import { getSafeErrorMessage } from "../../../lib/safeError";
import { generateVanityKeypairAsync } from "../../../lib/vanityKeypair";
import { pumpportalBuildCreateTokenTxBase64 } from "../../../lib/pumpportal";

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
    const vanitySuffix = typeof body?.vanitySuffix === "string" ? body.vanitySuffix.trim() : "HODL";
    const vanityMaxAttempts = typeof body?.vanityMaxAttempts === "number" ? body.vanityMaxAttempts : 50_000_000;

    let mintKeypair: Keypair;
    
    if (useVanity && vanitySuffix) {
      const upper = vanitySuffix.toUpperCase();
      if (upper !== "AMP" && upper !== "HODL") {
        return NextResponse.json({ error: 'vanitySuffix must be "AMP" or "HODL"' }, { status: 400 });
      }
      if (vanitySuffix !== "AMP" && vanitySuffix !== "HODL") {
        return NextResponse.json({ error: `vanitySuffix "${upper}" must be uppercase` }, { status: 400 });
      }

      await auditLog("admin_pumpfun_launch_vanity_start", { suffix: vanitySuffix });

      const caseSensitive = true;

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

    const lamportsToSolString = (lamports: bigint): string => {
      const neg = lamports < 0n;
      const x = neg ? -lamports : lamports;
      const whole = x / 1_000_000_000n;
      const frac = x % 1_000_000_000n;
      const fracStr = frac.toString().padStart(9, "0").replace(/0+$/, "");
      const base = fracStr ? `${whole.toString()}.${fracStr}` : whole.toString();
      return neg ? `-${base}` : base;
    };

    const built = await pumpportalBuildCreateTokenTxBase64({
      publicKey: user.toBase58(),
      mint: mintKeypair.publicKey.toBase58(),
      tokenMetadata: { name, symbol, uri },
      amountSol: lamportsToSolString(spendableSolInLamports),
      slippage: 10,
      priorityFee: 0.0005,
      pool: "pump",
      isMayhemMode,
    });

    const { VersionedTransaction } = await import("@solana/web3.js");
    const vtx = VersionedTransaction.deserialize(Uint8Array.from(Buffer.from(built.txBase64, "base64")));
    vtx.sign([mintKeypair]);

    const txBase64 = Buffer.from(vtx.serialize()).toString("base64");

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

    const bondingCurve = getBondingCurvePda(mintKeypair.publicKey);
    const feeRecipient = await getGlobalFeeRecipient({ connection });

    return NextResponse.json({
      ok: true,
      signature,
      explorerUrl: `https://solscan.io/tx/${encodeURIComponent(signature)}`,
      mint: mintKeypair.publicKey.toBase58(),
      bondingCurve: bondingCurve.toBase58(),
      associatedBondingCurve: getAssociatedTokenAddress({ owner: bondingCurve, mint: mintKeypair.publicKey }).toBase58(),
      associatedUser: getAssociatedTokenAddress({ owner: user, mint: mintKeypair.publicKey }).toBase58(),
      feeRecipient: feeRecipient.toBase58(),
      creator: creator.toBase58(),
      creatorVault: getCreatorVaultPda(creator).toBase58(),
    });
  } catch (e) {
    await auditLog("admin_pumpfun_launch_error", { error: getSafeErrorMessage(e) });
    return NextResponse.json({ error: getSafeErrorMessage(e) }, { status: 500 });
  }
}

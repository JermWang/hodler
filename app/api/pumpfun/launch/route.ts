import { NextResponse } from "next/server";
import { Keypair, PublicKey } from "@solana/web3.js";
import { Buffer } from "buffer";

import { isAdminRequestAsync } from "../../../lib/adminAuth";
import { verifyAdminOrigin } from "../../../lib/adminSession";
import { upsertProjectProfile } from "../../../lib/projectProfilesStore";
import { getConnection, getSolanaCaip2 } from "../../../lib/solana";
import { buildUnsignedPumpfunCreateV2Tx } from "../../../lib/pumpfun";
import { privySignAndSendSolanaTransaction } from "../../../lib/privy";
import { getSafeErrorMessage } from "../../../lib/safeError";

export const runtime = "nodejs";

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
    verifyAdminOrigin(req);
    if (!(await isAdminRequestAsync(req))) {
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

    const mintKeypair = Keypair.generate();

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
      minTokensOut: minTokensOut ?? 1n,
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
    return NextResponse.json({ error: getSafeErrorMessage(e) }, { status: 500 });
  }
}

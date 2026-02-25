import { NextRequest, NextResponse } from "next/server";
import { PublicKey, SystemInstruction, SystemProgram, Transaction } from "@solana/web3.js";
import { Buffer } from "buffer";
import bs58 from "bs58";
import nacl from "tweetnacl";

import { hasDatabase } from "@/app/lib/db";
import { getConnection } from "@/app/lib/solana";
import { confirmSignatureViaRpc, withRetry } from "@/app/lib/rpc";
import { getSafeErrorMessage } from "@/app/lib/safeError";
import { getHodlrFlags } from "@/app/lib/hodlr/flags";
import { getOrCreateHodlrEscrowWallet, signWithHodlrEscrow } from "@/app/lib/hodlr/escrow";
import {
  deleteHodlrPendingRewardClaimByTxSig,
  deleteStaleHodlrPendingRewardClaimsByWallet,
  insertHodlrRewardClaimsPendingBatch,
  listHodlrClaimableDistributionsByWalletAndEpochIds,
  listHodlrPendingRewardClaimsByWallet,
  markHodlrRewardClaimsCompletedBatch,
} from "@/app/lib/hodlr/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseEnvBool(raw: string | undefined): boolean {
  const v = String(raw ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function getPendingClaimTtlSeconds(): number {
  const raw = Number(process.env.HODLR_REWARD_CLAIM_TTL_SECONDS ?? "");
  if (Number.isFinite(raw) && raw > 0) return Math.floor(raw);
  return 5 * 60;
}

function getEscrowReserveLamports(): number {
  const raw = Number(process.env.HODLR_ESCROW_RESERVE_LAMPORTS ?? "");
  if (Number.isFinite(raw) && raw > 0) return Math.floor(raw);
  return 20_000_000;
}

function requireSafeLamportsNumber(totalLamports: bigint): number {
  if (totalLamports <= 0n) return 0;
  const max = BigInt(Number.MAX_SAFE_INTEGER);
  if (totalLamports > max) {
    throw new Error("Claim amount too large");
  }
  return Number(totalLamports);
}

function uniqueStrings(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of values) {
    const s = String(v ?? "").trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function findSingleSystemTransferInstruction(tx: Transaction): { fromPubkey: PublicKey; toPubkey: PublicKey; lamports: bigint } | null {
  let decoded: { fromPubkey: PublicKey; toPubkey: PublicKey; lamports: bigint } | null = null;
  for (const ix of tx.instructions) {
    if (!ix.programId.equals(SystemProgram.programId)) continue;
    let d: { fromPubkey: PublicKey; toPubkey: PublicKey; lamports: bigint } | null = null;
    try {
      d = SystemInstruction.decodeTransfer(ix);
    } catch {
      d = null;
    }
    if (!d) continue;
    if (decoded) return null;
    decoded = d;
  }
  return decoded;
}

export async function GET(req: NextRequest) {
  try {
    const flags = getHodlrFlags();
    if (!flags.enabled) {
      return NextResponse.json({ ok: true, skipped: true, reason: "HODLR disabled", flags });
    }

    if (!hasDatabase()) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    const { searchParams } = new URL(req.url);
    const walletPubkey = searchParams.get("wallet")?.trim() ?? "";
    const epochIdsParam = searchParams.get("epochIds")?.trim() ?? "";
    const epochIds = uniqueStrings(
      epochIdsParam
      ? epochIdsParam
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : []
    );

    if (!walletPubkey) {
      return NextResponse.json({ error: "wallet required" }, { status: 400 });
    }

    let recipientPubkey: PublicKey;
    try {
      recipientPubkey = new PublicKey(walletPubkey);
    } catch {
      return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
    }

    if (!epochIds.length) {
      return NextResponse.json({ error: "epochIds required" }, { status: 400 });
    }

    const claimables = await listHodlrClaimableDistributionsByWalletAndEpochIds({ walletPubkey, epochIds });
    if (!claimables.length || claimables.length !== epochIds.length) {
      return NextResponse.json({ error: "No claimable HODLR rewards" }, { status: 400 });
    }

    const totalLamports = claimables.reduce((sum, r) => sum + BigInt(String(r.amountLamports ?? "0")), 0n);
    if (totalLamports <= 0n) {
      return NextResponse.json({ error: "No claimable HODLR rewards" }, { status: 400 });
    }

    const escrow = await getOrCreateHodlrEscrowWallet();
    const escrowPubkey = new PublicKey(escrow.walletPubkey);

    const connection = getConnection();

    const escrowBalance = await withRetry(() => connection.getBalance(escrowPubkey, "confirmed"));
    const reserveLamports = getEscrowReserveLamports();
    const totalLamportsNum = requireSafeLamportsNumber(totalLamports);
    const requiredWithReserve = totalLamportsNum + reserveLamports;

    if (escrowBalance < requiredWithReserve) {
      return NextResponse.json(
        { error: "Reward pool is currently being replenished" },
        { status: 503 }
      );
    }

    const { blockhash, lastValidBlockHeight } = await withRetry(() => connection.getLatestBlockhash("confirmed"));

    const tx = new Transaction();
    tx.recentBlockhash = blockhash;
    tx.lastValidBlockHeight = lastValidBlockHeight;
    tx.feePayer = recipientPubkey;
    tx.add(
      SystemProgram.transfer({
        fromPubkey: escrowPubkey,
        toPubkey: recipientPubkey,
        lamports: totalLamportsNum,
      })
    );

    const { signedTransactionBase64 } = await signWithHodlrEscrow({ transaction: tx });

    return NextResponse.json({
      ok: true,
      transaction: signedTransactionBase64,
      totalLamports: totalLamports.toString(),
      totalSol: Number(totalLamports) / 1e9,
      epochIds: claimables.map((c) => c.epochId),
      blockhash,
      lastValidBlockHeight,
      escrowWallet: escrow.walletPubkey,
      sendEnabled: parseEnvBool(process.env.HODLR_CLAIMS_SEND_ENABLED),
      flags,
    });
  } catch (e) {
    return NextResponse.json({ error: "Failed to prepare claim", details: getSafeErrorMessage(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const flags = getHodlrFlags();
    if (!flags.enabled) {
      return NextResponse.json({ ok: true, skipped: true, reason: "HODLR disabled", flags });
    }

    if (!hasDatabase()) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    const sendEnabled = parseEnvBool(process.env.HODLR_CLAIMS_SEND_ENABLED);
    if (!sendEnabled) {
      return NextResponse.json({ error: "HODLR claims are not enabled" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const signedTransactionBase64 = String(body.signedTransaction ?? "").trim();
    const walletPubkey = String(body.walletPubkey ?? "").trim();
    const epochIds = uniqueStrings(
      Array.isArray(body.epochIds) ? (body.epochIds as unknown[]).map((v) => String(v).trim()).filter(Boolean) : []
    );

    if (!signedTransactionBase64) {
      return NextResponse.json({ error: "signedTransaction required" }, { status: 400 });
    }
    if (!walletPubkey) {
      return NextResponse.json({ error: "walletPubkey required" }, { status: 400 });
    }
    if (!epochIds.length) {
      return NextResponse.json({ error: "epochIds required" }, { status: 400 });
    }

    let recipientPubkey: PublicKey;
    try {
      recipientPubkey = new PublicKey(walletPubkey);
    } catch {
      return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
    }

    const connection = getConnection();

    let tx: Transaction;
    try {
      const txBytes = Buffer.from(signedTransactionBase64, "base64");
      tx = Transaction.from(txBytes);
    } catch {
      return NextResponse.json({ error: "Invalid transaction format" }, { status: 400 });
    }

    const feePayerStr = tx.feePayer?.toBase58?.() ?? "";
    if (feePayerStr !== recipientPubkey.toBase58()) {
      return NextResponse.json({ error: "Invalid fee payer" }, { status: 400 });
    }

    const userSigEntry = tx.signatures.find((s) => s.publicKey.equals(recipientPubkey));
    const userSigBytes = userSigEntry?.signature ?? null;
    if (!userSigBytes) {
      return NextResponse.json({ error: "Missing user signature" }, { status: 400 });
    }

    const msg = tx.serializeMessage();
    const msgBytes = new Uint8Array(msg);
    const userSigU8 = new Uint8Array(userSigBytes);
    const sigOk = nacl.sign.detached.verify(msgBytes, userSigU8, recipientPubkey.toBytes());
    if (!sigOk) {
      return NextResponse.json({ error: "Invalid transaction signature" }, { status: 401 });
    }

    const txSig = bs58.encode(userSigU8);

    const ttlSeconds = getPendingClaimTtlSeconds();
    const nowUnix = Math.floor(Date.now() / 1000);
    const staleBefore = nowUnix - ttlSeconds;

    const pending = await listHodlrPendingRewardClaimsByWallet({ walletPubkey });
    if (pending.length) {
      const freshest = pending[0];
      const claimedAt = Number(freshest?.claimedAtUnix ?? 0);
      if (Number.isFinite(claimedAt) && claimedAt > 0 && nowUnix - claimedAt <= ttlSeconds) {
        return NextResponse.json({ error: "Found pending reward claims" }, { status: 409 });
      }
      await deleteStaleHodlrPendingRewardClaimsByWallet({ walletPubkey, staleBeforeUnix: staleBefore });
    }

    const claimables = await listHodlrClaimableDistributionsByWalletAndEpochIds({ walletPubkey, epochIds });
    if (!claimables.length || claimables.length !== epochIds.length) {
      return NextResponse.json({ error: "No claimable HODLR rewards" }, { status: 400 });
    }

    const totalLamports = claimables.reduce((sum, r) => sum + BigInt(String(r.amountLamports ?? "0")), 0n);
    const totalLamportsNum = requireSafeLamportsNumber(totalLamports);

    const escrow = await getOrCreateHodlrEscrowWallet();
    const escrowPubkey = new PublicKey(escrow.walletPubkey);

    const escrowSigEntry = tx.signatures.find((s) => s.publicKey.equals(escrowPubkey));
    const escrowSigBytes = escrowSigEntry?.signature ?? null;
    if (!escrowSigBytes) {
      return NextResponse.json({ error: "Missing escrow signature" }, { status: 400 });
    }
    const escrowSigU8 = new Uint8Array(escrowSigBytes);
    const escrowSigOk = nacl.sign.detached.verify(msgBytes, escrowSigU8, escrowPubkey.toBytes());
    if (!escrowSigOk) {
      return NextResponse.json({ error: "Invalid escrow signature" }, { status: 401 });
    }

    const decoded = findSingleSystemTransferInstruction(tx);

    if (
      !decoded ||
      !decoded.fromPubkey.equals(escrowPubkey) ||
      !decoded.toPubkey.equals(recipientPubkey) ||
      decoded.lamports !== BigInt(totalLamportsNum)
    ) {
      return NextResponse.json({ error: "Invalid transaction contents" }, { status: 400 });
    }

    const reserved = await insertHodlrRewardClaimsPendingBatch({
      walletPubkey,
      txSig,
      claimedAtUnix: nowUnix,
      rows: claimables.map((c) => ({ epochId: c.epochId, amountLamports: c.amountLamports })),
    });

    if (!reserved.ok) {
      return NextResponse.json({ error: "Found pending reward claims" }, { status: 409 });
    }

    try {
      const sig = await withRetry(() =>
        connection.sendRawTransaction(tx.serialize(), {
          skipPreflight: false,
          preflightCommitment: "confirmed",
          maxRetries: 3,
        })
      );

      await confirmSignatureViaRpc(connection, sig, "confirmed");

      await markHodlrRewardClaimsCompletedBatch({
        walletPubkey,
        epochIds: claimables.map((c) => c.epochId),
        txSig: sig,
      });

      return NextResponse.json({
        success: true,
        txSig: sig,
        totalLamports: totalLamports.toString(),
        totalSol: Number(totalLamports) / 1e9,
        epochsClaimed: claimables.map((c) => c.epochId),
      });
    } catch (sendErr) {
      for (const c of claimables) {
        await deleteHodlrPendingRewardClaimByTxSig({ epochId: c.epochId, walletPubkey, txSig }).catch(() => null);
      }
      throw sendErr;
    }
  } catch (e) {
    return NextResponse.json({ error: "Failed to process claim", details: getSafeErrorMessage(e) }, { status: 500 });
  }
}

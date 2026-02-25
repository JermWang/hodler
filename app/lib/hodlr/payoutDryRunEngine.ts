import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";

import { getPool, hasDatabase } from "../db";
import { getConnection } from "../solana";
import { withRetry } from "../rpc";
import { isHodlrShadowMode } from "./flags";
import {
  ensureHodlrSchema,
  getHodlrPayoutDryRun,
  insertHodlrPayoutDryRunIfAbsent,
  listHodlrDistributions,
  listHodlrPayoutDryRunItems,
} from "./store";

function getDefaultSourcePubkeyFromEnv(): string {
  const raw = String(process.env.HODLR_PAYOUT_SOURCE_PUBKEY ?? "").trim();
  return raw;
}

function getMaxRecipients(): number {
  const raw = Number(process.env.HODLR_PAYOUT_MAX_RECIPIENTS ?? "");
  if (Number.isFinite(raw) && raw > 0) return Math.max(1, Math.min(500, Math.floor(raw)));
  return 50;
}

function safeParseLamports(s: string): bigint {
  try {
    const v = BigInt(String(s ?? "").trim());
    return v > 0n ? v : 0n;
  } catch {
    return 0n;
  }
}

function requireSafeLamportsNumber(totalLamports: bigint): number {
  if (totalLamports <= 0n) return 0;
  const max = BigInt(Number.MAX_SAFE_INTEGER);
  if (totalLamports > max) throw new Error("Amount too large");
  return Number(totalLamports);
}

export async function runHodlrPayoutDryRunShadow(input?: {
  epochId?: string;
  includeTxTemplates?: boolean;
}): Promise<{
  ok: true;
  skipped?: boolean;
  reason?: string;
  epochId?: string;
  sourcePubkey?: string;
  sourceBalanceLamports?: string;
  totalLamports?: string;
  recipientCount?: number;
  persisted?: boolean;
  items?: Array<{ walletPubkey: string; amountLamports: string; txBase64?: string }>;
}> {
  if (!isHodlrShadowMode()) return { ok: true, skipped: true, reason: "HODLR shadow mode disabled" };
  if (!hasDatabase()) return { ok: true, skipped: true, reason: "Database not available" };

  await ensureHodlrSchema();

  const epochId = String(input?.epochId ?? "").trim();
  if (!epochId) return { ok: true, skipped: true, reason: "epochId required" };

  const pool = getPool();
  const lockClient = await pool.connect();
  let lockAcquired = false;
  try {
    const lockKey = `hodlr_payout_dry_run:${epochId}`;
    const lockRes = await lockClient.query("select pg_try_advisory_lock(hashtext($1)) as ok", [lockKey]);
    lockAcquired = Boolean(lockRes.rows?.[0]?.ok);
    if (!lockAcquired) {
      return { ok: true, skipped: true, reason: "Payout dry run already running", epochId };
    }

    const existing = await getHodlrPayoutDryRun(epochId);
    if (existing) {
      const items = await listHodlrPayoutDryRunItems(epochId);
      return {
        ok: true,
        epochId,
        sourcePubkey: existing.sourcePubkey,
        sourceBalanceLamports: existing.sourceBalanceLamports,
        totalLamports: existing.totalLamports,
        recipientCount: existing.recipientCount,
        persisted: true,
        items,
      };
    }

    const dists = await listHodlrDistributions(epochId);
    if (!dists.length) return { ok: true, skipped: true, reason: "No hodlr_distributions for epoch", epochId };

    const maxRecipients = getMaxRecipients();
    const trimmed = dists.slice(0, maxRecipients);

    let sourceRaw = getDefaultSourcePubkeyFromEnv();
    if (!sourceRaw) return { ok: true, skipped: true, reason: "Missing HODLR_PAYOUT_SOURCE_PUBKEY", epochId };

    let sourcePk: PublicKey;
    try {
      sourcePk = new PublicKey(sourceRaw);
    } catch {
      return { ok: true, skipped: true, reason: "Invalid HODLR_PAYOUT_SOURCE_PUBKEY", epochId };
    }

    const totalLamports = trimmed.reduce((sum, r) => sum + safeParseLamports(r.amountLamports), 0n);

    const connection = getConnection();
    const sourceBalance = await withRetry(() => connection.getBalance(sourcePk, "confirmed"));

    const persisted = await insertHodlrPayoutDryRunIfAbsent({
      epochId,
      sourcePubkey: sourcePk.toBase58(),
      sourceBalanceLamports: String(sourceBalance),
      totalLamports: totalLamports.toString(),
      rows: trimmed.map((r) => ({ walletPubkey: r.walletPubkey, amountLamports: r.amountLamports })),
    });

    const includeTxTemplates = Boolean(input?.includeTxTemplates);

    let txBlockhash: { blockhash: string; lastValidBlockHeight: number } | null = null;
    if (includeTxTemplates) {
      txBlockhash = await withRetry(() => connection.getLatestBlockhash("confirmed"));
    }

    const items: Array<{ walletPubkey: string; amountLamports: string; txBase64?: string }> = [];

    for (const r of trimmed) {
      const walletPubkey = String(r.walletPubkey ?? "").trim();
      const amountLamports = String(r.amountLamports ?? "").trim();
      if (!walletPubkey || !amountLamports) continue;

      if (!includeTxTemplates) {
        items.push({ walletPubkey, amountLamports });
        continue;
      }

      let recipientPk: PublicKey;
      try {
        recipientPk = new PublicKey(walletPubkey);
      } catch {
        items.push({ walletPubkey, amountLamports });
        continue;
      }

      const lamports = safeParseLamports(amountLamports);
      const lamportsNum = requireSafeLamportsNumber(lamports);

      const tx = new Transaction();
      tx.recentBlockhash = String(txBlockhash?.blockhash ?? "");
      tx.lastValidBlockHeight = Number(txBlockhash?.lastValidBlockHeight ?? 0);
      tx.feePayer = recipientPk;
      tx.add(
        SystemProgram.transfer({
          fromPubkey: sourcePk,
          toPubkey: recipientPk,
          lamports: lamportsNum,
        })
      );

      const txBase64 = tx
        .serialize({ requireAllSignatures: false, verifySignatures: false })
        .toString("base64");

      items.push({ walletPubkey, amountLamports, txBase64 });
    }

    return {
      ok: true,
      epochId,
      sourcePubkey: sourcePk.toBase58(),
      sourceBalanceLamports: String(sourceBalance),
      totalLamports: totalLamports.toString(),
      recipientCount: trimmed.length,
      persisted: !persisted.skipped,
      items,
    };
  } finally {
    if (lockAcquired) {
      try {
        const lockKey = `hodlr_payout_dry_run:${epochId}`;
        await lockClient.query("select pg_advisory_unlock(hashtext($1))", [lockKey]);
      } catch {
      }
    }
    lockClient.release();
  }
}

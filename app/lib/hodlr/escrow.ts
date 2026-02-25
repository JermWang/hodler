import crypto from "crypto";

import { Transaction } from "@solana/web3.js";

import { getPool, hasDatabase } from "../db";
import { privyCreateSolanaWalletWithIdempotencyKey, privySignSolanaTransaction } from "../privy";
import { ensureHodlrSchema, getHodlrEscrowWallet } from "./store";

export type HodlrEscrowWallet = {
  id: string;
  privyWalletId: string;
  walletPubkey: string;
  createdAtUnix: number;
};

function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

function rowToEscrow(row: any): HodlrEscrowWallet {
  return {
    id: String(row.id),
    privyWalletId: String(row.privy_wallet_id),
    walletPubkey: String(row.wallet_pubkey),
    createdAtUnix: Number(row.created_at_unix),
  };
}

export async function getOrCreateHodlrEscrowWallet(): Promise<HodlrEscrowWallet> {
  await ensureHodlrSchema();
  if (!hasDatabase()) throw new Error("Database not available");

  const existing = await getHodlrEscrowWallet();
  if (existing) return existing;

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtext($1))", ["hodlr_escrow_wallet"]);

    const again = await client.query(`select * from public.hodlr_escrow_wallets order by created_at_unix desc limit 1`);
    const againRow = again.rows?.[0];
    if (againRow) {
      await client.query("commit");
      return rowToEscrow(againRow);
    }

    const { walletId, address } = await privyCreateSolanaWalletWithIdempotencyKey({
      idempotencyKey: "hodlr_escrow_wallet",
    });

    const id = crypto.randomUUID();
    const ts = nowUnix();

    const inserted = await client.query(
      `insert into public.hodlr_escrow_wallets (id, privy_wallet_id, wallet_pubkey, created_at_unix)
       values ($1,$2,$3,$4)
       returning *`,
      [id, walletId, address, String(ts)]
    );

    const row = inserted.rows?.[0];
    if (!row) throw new Error("Failed to create HODLR escrow wallet");

    await client.query("commit");
    return rowToEscrow(row);
  } catch (e) {
    try {
      await client.query("rollback");
    } catch {
    }
    throw e;
  } finally {
    client.release();
  }
}

export async function signWithHodlrEscrow(input: { transaction: Transaction }): Promise<{ signedTransactionBase64: string }> {
  const escrow = await getOrCreateHodlrEscrowWallet();

  const txBase64 = input.transaction.serialize({ requireAllSignatures: false }).toString("base64");

  return privySignSolanaTransaction({
    walletId: escrow.privyWalletId,
    transactionBase64: txBase64,
  });
}

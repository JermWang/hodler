/**
 * Campaign Escrow Wallet Management
 * 
 * Each manual lock-up campaign with SPL token rewards gets its own
 * Privy-managed escrow wallet. This ensures:
 * 1. Project tokens are held separately per campaign
 * 2. Only the campaign's escrow can pay out that campaign's rewards
 * 3. Clear custody chain: Creator -> Campaign Escrow -> Holders
 */

import { PublicKey, Transaction } from "@solana/web3.js";
import { getPool, hasDatabase } from "./db";
import { getConnection } from "./solana";
import {
  privySignSolanaTransaction,
} from "./privy";
import { withRetry } from "./rpc";
import crypto from "crypto";

export interface CampaignEscrowWallet {
  id: string;
  campaignId: string;
  privyWalletId: string;
  walletPubkey: string;
  createdAtUnix: number;
}

/**
 * Create a new Privy-managed escrow wallet for a campaign
 */
export async function createCampaignEscrowWallet(campaignId: string): Promise<CampaignEscrowWallet> {
  if (!hasDatabase()) throw new Error("Database not available");

  const pool = getPool();
  const nowUnix = Math.floor(Date.now() / 1000);

  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [`campaign_escrow_wallet:${campaignId}`]);

    // Check if campaign already has an escrow wallet
    const existing = await client.query(
      `SELECT * FROM public.campaign_escrow_wallets WHERE campaign_id = $1`,
      [campaignId]
    );

    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      await client.query("commit");
      return {
        id: row.id,
        campaignId: row.campaign_id,
        privyWalletId: row.privy_wallet_id,
        walletPubkey: row.wallet_pubkey,
        createdAtUnix: Number(row.created_at_unix),
      };
    }

    // Create new Privy wallet (external call) while holding lock to prevent duplicates
    const { privyCreateSolanaWalletWithIdempotencyKey } = await import("./privy");
    const { walletId, address } = await privyCreateSolanaWalletWithIdempotencyKey({
      idempotencyKey: `campaign_escrow_wallet:${campaignId}`,
    });
    const id = crypto.randomUUID();

    await client.query(
      `INSERT INTO public.campaign_escrow_wallets 
       (id, campaign_id, privy_wallet_id, wallet_pubkey, created_at_unix)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, campaignId, walletId, address, nowUnix]
    );

    // Update campaign with escrow wallet pubkey
    await client.query(
      `UPDATE public.campaigns 
       SET escrow_wallet_pubkey = $2, updated_at_unix = $3
       WHERE id = $1`,
      [campaignId, address, nowUnix]
    );

    await client.query("commit");
    return {
      id,
      campaignId,
      privyWalletId: walletId,
      walletPubkey: address,
      createdAtUnix: nowUnix,
    };
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

/**
 * Get escrow wallet for a campaign
 */
export async function getCampaignEscrowWallet(campaignId: string): Promise<CampaignEscrowWallet | null> {
  if (!hasDatabase()) return null;

  const pool = getPool();
  const result = await pool.query(
    `SELECT * FROM public.campaign_escrow_wallets WHERE campaign_id = $1`,
    [campaignId]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    id: row.id,
    campaignId: row.campaign_id,
    privyWalletId: row.privy_wallet_id,
    walletPubkey: row.wallet_pubkey,
    createdAtUnix: Number(row.created_at_unix),
  };
}

/**
 * Get escrow wallet by pubkey (for looking up which campaign it belongs to)
 */
export async function getCampaignEscrowWalletByPubkey(walletPubkey: string): Promise<CampaignEscrowWallet | null> {
  if (!hasDatabase()) return null;

  const pool = getPool();
  const result = await pool.query(
    `SELECT * FROM public.campaign_escrow_wallets WHERE wallet_pubkey = $1`,
    [walletPubkey]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    id: row.id,
    campaignId: row.campaign_id,
    privyWalletId: row.privy_wallet_id,
    walletPubkey: row.wallet_pubkey,
    createdAtUnix: Number(row.created_at_unix),
  };
}

/**
 * Sign a transaction using the campaign's escrow wallet (via Privy)
 */
export async function signWithCampaignEscrow(input: {
  campaignId: string;
  transaction: Transaction;
}): Promise<{ signedTransactionBase64: string }> {
  const escrow = await getCampaignEscrowWallet(input.campaignId);
  if (!escrow) {
    throw new Error(`No escrow wallet found for campaign ${input.campaignId}`);
  }

  const txBase64 = input.transaction.serialize({ requireAllSignatures: false }).toString("base64");

  return privySignSolanaTransaction({
    walletId: escrow.privyWalletId,
    transactionBase64: txBase64,
  });
}

/**
 * Get SPL token balance in campaign escrow wallet
 */
export async function getCampaignEscrowTokenBalance(input: {
  campaignId: string;
  mint: string;
}): Promise<{ balance: bigint; decimals: number }> {
  const escrow = await getCampaignEscrowWallet(input.campaignId);
  if (!escrow) {
    return { balance: 0n, decimals: 0 };
  }

  const { getTokenBalanceForMint } = await import("./solana");
  const connection = getConnection();
  const mintPk = new PublicKey(input.mint);
  const ownerPk = new PublicKey(escrow.walletPubkey);

  try {
    const result = await getTokenBalanceForMint({ connection, mint: mintPk, owner: ownerPk });
    return { balance: result.amountRaw, decimals: result.decimals };
  } catch {
    return { balance: 0n, decimals: 0 };
  }
}

/**
 * Get SOL balance in campaign escrow wallet
 */
export async function getCampaignEscrowSolBalance(campaignId: string): Promise<bigint> {
  const escrow = await getCampaignEscrowWallet(campaignId);
  if (!escrow) return 0n;

  const connection = getConnection();
  const ownerPk = new PublicKey(escrow.walletPubkey);

  try {
    const balance = await withRetry(() => connection.getBalance(ownerPk, "confirmed"));
    return BigInt(balance);
  } catch {
    return 0n;
  }
}

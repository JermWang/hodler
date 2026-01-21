/**
 * Bags.fm SDK Adapter for AmpliFi
 * 
 * This module provides a clean interface to the Bags API for:
 * - Token launches (replacing Pump.fun)
 * - Fee share configuration and updates
 * - Claimable balance queries
 * - Claim transaction generation
 * 
 * Architecture:
 * - AmpliFi decides entitlement (who earns, how much, when)
 * - Bags enforces settlement (launch, fee routing, claims)
 * - No custody: we only generate transactions via Bags
 * 
 * Note: This adapter uses direct Bags API calls rather than the SDK
 * because the SDK requires raw Keypairs, but AmpliFi uses Privy-managed
 * wallets where keys are never exposed.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
  Transaction,
} from "@solana/web3.js";
import bs58 from "bs58";

import { getConnection, confirmTransactionSignature } from "./solana";
import { privySignSolanaTransaction } from "./privy";

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const BAGS_API_KEY = process.env.BAGS_API_KEY ?? "";
const BAGS_API_BASE = "https://public-api-v2.bags.fm/api/v1";

// Partner configuration for earning fees on tokens launched through AmpliFi
// Create your partner key at https://dev.bags.fm
// Default partner fee share is 25% (2500 bps) of trading fees
const BAGS_PARTNER_WALLET = process.env.BAGS_PARTNER_WALLET ?? "";
const BAGS_PARTNER_CONFIG = process.env.BAGS_PARTNER_CONFIG ?? "";

// Per Bags docs: when there are more than 15 fee claimers, lookup tables are required.
// The official SDK auto-creates LUTs via getConfigCreationLookupTableTransactions().
// Our Privy-signing + direct-API approach currently does NOT create LUTs, so we must
// enforce the non-LUT limit to avoid on-chain tx failures.
const BAGS_MAX_CLAIMERS_NON_LUT = 15;

export function hasBagsApiKey(): boolean {
  return Boolean(BAGS_API_KEY);
}

const BAGS_TOKEN_VERIFY_TTL_MS = 10 * 60_000;
const verifiedMintCache = new Map<string, { ok: boolean; ts: number }>();

export async function verifyBagsTokenMintViaApi(tokenMint: string): Promise<boolean> {
  const mint = String(tokenMint ?? "").trim();
  if (!mint) return false;
  if (!BAGS_API_KEY) return false;

  const now = Date.now();
  const cached = verifiedMintCache.get(mint);
  if (cached && now - cached.ts < BAGS_TOKEN_VERIFY_TTL_MS) return cached.ok;

  const paramNames = ["tokenMint", "mint", "baseMint"] as const;
  for (const paramName of paramNames) {
    try {
      const response = await bagsApiFetch(`/token-launch/creator/v3?${paramName}=${encodeURIComponent(mint)}`, { method: "GET" });
      const ok = Array.isArray(response) && response.length > 0;
      verifiedMintCache.set(mint, { ok, ts: now });
      return ok;
    } catch {
    }
  }

  verifiedMintCache.set(mint, { ok: false, ts: now });
  return false;
}

export function hasBagsPartnerConfig(): boolean {
  return Boolean(BAGS_PARTNER_WALLET) && Boolean(BAGS_PARTNER_CONFIG);
}

function getBagsHeaders(): Record<string, string> {
  if (!BAGS_API_KEY) {
    throw new Error("BAGS_API_KEY environment variable is required");
  }
  return {
    "x-api-key": BAGS_API_KEY,
  };
}

async function bagsApiFetch(path: string, options: RequestInit = {}): Promise<any> {
  const url = `${BAGS_API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      ...getBagsHeaders(),
      ...(options.headers || {}),
    },
  });

  const json = await res.json().catch(() => null);

  // Bags API response envelope (per docs):
  // { success: true, response: ... }
  // { success: false, error: "..." }
  if (json?.success === false) {
    throw new Error(String(json?.error ?? "Bags API error"));
  }

  if (!res.ok) {
    const errorMsg = json?.error || `Bags API error: ${res.status}`;
    throw new Error(errorMsg);
  }

  return json?.response ?? json;
}

type BagsFeeShareWalletLookupV2 = {
  provider: string;
  username: string;
  wallet: string;
  platformData?: {
    id?: string;
    username?: string;
    display_name?: string;
    avatar_url?: string;
  };
};

export async function getFeeShareWalletsV2Bulk(
  items: Array<{ provider: string; username: string }>
): Promise<{ ok: true; results: BagsFeeShareWalletLookupV2[] } | { ok: false; error: string }> {
  try {
    const cleaned = items
      .map((i) => ({ provider: String(i.provider ?? "").trim(), username: String(i.username ?? "").trim() }))
      .filter((i) => i.provider && i.username);

    if (cleaned.length === 0) {
      return { ok: true, results: [] };
    }

    const seen = new Set<string>();
    const deduped: Array<{ provider: string; username: string }> = [];
    for (const item of cleaned) {
      const key = `${item.provider}:${item.username}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(item);
    }

    const response: BagsFeeShareWalletLookupV2[] = await bagsApiFetch("/token-launch/fee-share/wallet/v2/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: deduped }),
    });

    return {
      ok: true,
      results: Array.isArray(response) ? response : [],
    };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e) };
  }
}

function bagsTxBase58ToBase64(txB58: string): string {
  const bytes = bs58.decode(txB58);
  return Buffer.from(bytes).toString("base64");
}

function decodeMaybeNumber(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface BagsLaunchParams {
  name: string;
  symbol: string;
  description: string;
  imageUrl: string;
  twitterUrl?: string;
  websiteUrl?: string;
  telegramUrl?: string;
  initialBuyLamports: number;
  // For Privy-managed wallets
  privyWalletId: string;
  launchWalletPubkey: PublicKey;
  // For direct keypair signing (optional, used when keypair is available)
  launchWalletKeypair?: Keypair;
  feeClaimers?: Array<{
    walletPubkey: PublicKey;
    bps: number; // Basis points (10000 = 100%)
  }>;
}

export interface BagsLaunchResult {
  ok: true;
  tokenMint: string;
  metadataUri: string;
  configKey: string;
  launchSignature: string;
}

export interface FeeClaimer {
  user: PublicKey;
  userBps: number;
}

export interface ClaimablePosition {
  baseMint: string;
  virtualPoolAddress: string;
  virtualPoolClaimableAmount?: string;
  dammPoolClaimableAmount?: string;
  totalClaimableLamportsUserShare?: string;
  isCustomFeeVault?: boolean;
  customFeeVaultBalance?: string;
  customFeeVaultBps?: number;
  customFeeVaultClaimerSide?: string;
  isMigrated?: boolean;
}

export interface BagsClaimResult {
  ok: boolean;
  transactions: VersionedTransaction[];
  totalClaimableLamports: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Bags API Types
// ─────────────────────────────────────────────────────────────────────────────

interface BagsTokenInfoResponse {
  tokenMint: string;
  tokenMetadata: string;
}

type BagsTxWithBlockhash = {
  transaction: string; // base58 encoded serialized transaction
  blockhash: {
    blockhash: string;
    lastValidBlockHeight: number;
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Token Launch
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Launch a token via Bags.fm
 * 
 * This replaces the Pump.fun launch flow. The token is created on Bags
 * with configurable fee sharing.
 * 
 * Uses Bags API directly to get unsigned transactions, then signs via Privy.
 */
export async function launchTokenViaBags(params: BagsLaunchParams): Promise<BagsLaunchResult> {
  const connection = getConnection();
  const launchWallet = params.launchWalletPubkey;

  // Step 1: Create token info and metadata via Bags API
  const tokenInfoForm = new FormData();
  tokenInfoForm.set("imageUrl", params.imageUrl);
  tokenInfoForm.set("name", params.name);
  tokenInfoForm.set("symbol", params.symbol.toUpperCase().replace("$", ""));
  tokenInfoForm.set("description", params.description);
  if (params.telegramUrl) tokenInfoForm.set("telegram", params.telegramUrl);
  if (params.twitterUrl) tokenInfoForm.set("twitter", params.twitterUrl);
  if (params.websiteUrl) tokenInfoForm.set("website", params.websiteUrl);

  const tokenInfoResponse: BagsTokenInfoResponse = await bagsApiFetch("/token-launch/create-token-info", {
    method: "POST",
    // Do NOT set Content-Type header; fetch will add multipart boundary.
    body: tokenInfoForm,
  });

  if (!tokenInfoResponse.tokenMint || !tokenInfoResponse.tokenMetadata) {
    throw new Error("Bags API did not return token mint or metadata");
  }

  const tokenMint = new PublicKey(tokenInfoResponse.tokenMint);

  // Step 2: Build fee claimers array for the config
  // IMPORTANT: Total BPS must equal 10000 (100%)
  let feeClaimers: FeeClaimer[] = [];

  if (params.feeClaimers && params.feeClaimers.length > 0) {
    const feeClaimersBps = params.feeClaimers.reduce((sum, fc) => sum + fc.bps, 0);
    const creatorBps = 10000 - feeClaimersBps;

    if (creatorBps < 0) {
      throw new Error("Total fee claimer BPS cannot exceed 10000 (100%)");
    }

    // Add creator first with explicit BPS
    if (creatorBps > 0) {
      feeClaimers.push({ user: launchWallet, userBps: creatorBps });
    }

    // Add fee claimers
    for (const fc of params.feeClaimers) {
      feeClaimers.push({ user: fc.walletPubkey, userBps: fc.bps });
    }
  } else {
    // No fee claimers - all fees go to creator wallet (managed by AmpliFi)
    feeClaimers = [{ user: launchWallet, userBps: 10000 }];
  }

  // Step 3: Create fee share config via Bags API
  if (feeClaimers.length > BAGS_MAX_CLAIMERS_NON_LUT) {
    throw new Error(
      `Too many fee claimers (${feeClaimers.length}). Bags requires LUTs when claimers > ${BAGS_MAX_CLAIMERS_NON_LUT}. ` +
        "This adapter currently supports up to 15 fee claimers."
    );
  }

  const configBody: Record<string, unknown> = {
    payer: launchWallet.toBase58(),
    baseMint: tokenMint.toBase58(),
    claimersArray: feeClaimers.map((fc) => fc.user.toBase58()),
    basisPointsArray: feeClaimers.map((fc) => fc.userBps),
  };

  // Include partner config if set - AmpliFi earns 25% of trading fees on launched tokens
  if (BAGS_PARTNER_WALLET && BAGS_PARTNER_CONFIG) {
    configBody.partner = BAGS_PARTNER_WALLET;
    configBody.partnerConfig = BAGS_PARTNER_CONFIG;
  }

  const configResponse: {
    needsCreation: boolean;
    feeShareAuthority: string;
    meteoraConfigKey: string;
    transactions?: BagsTxWithBlockhash[];
    bundles?: BagsTxWithBlockhash[][];
  } = await bagsApiFetch("/fee-share/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(configBody),
  });

  // Sign and send config transactions (flatten bundles + transactions)
  const configTxs: BagsTxWithBlockhash[] = [];
  if (Array.isArray(configResponse.bundles)) {
    for (const bundle of configResponse.bundles) {
      if (Array.isArray(bundle)) configTxs.push(...bundle);
    }
  }
  if (Array.isArray(configResponse.transactions)) {
    configTxs.push(...configResponse.transactions);
  }

  for (const item of configTxs) {
    const unsignedBase64 = bagsTxBase58ToBase64(item.transaction);
    const signed = await privySignSolanaTransaction({
      walletId: params.privyWalletId,
      transactionBase64: unsignedBase64,
    });

    const raw = Buffer.from(signed.signedTransactionBase64, "base64");
    const sig = await connection.sendRawTransaction(raw, {
      skipPreflight: false,
      preflightCommitment: "processed",
    });
    await confirmTransactionSignature({
      connection,
      signature: sig,
      blockhash: item.blockhash.blockhash,
      lastValidBlockHeight: item.blockhash.lastValidBlockHeight,
    });
  }

  const configKey = configResponse.meteoraConfigKey;

  // Step 4: Get launch transaction from Bags API
  const launchBody = {
    ipfs: tokenInfoResponse.tokenMetadata,
    tokenMint: tokenMint.toBase58(),
    wallet: launchWallet.toBase58(),
    initialBuyLamports: params.initialBuyLamports,
    configKey,
  };

  const launchTxB58: string = await bagsApiFetch("/token-launch/create-launch-transaction", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(launchBody),
  });

  if (!launchTxB58) {
    throw new Error("Bags API did not return launch transaction");
  }

  // Step 5: Sign and send the launch transaction via Privy
  const signed = await privySignSolanaTransaction({
    walletId: params.privyWalletId,
    transactionBase64: bagsTxBase58ToBase64(launchTxB58),
  });

  const raw = Buffer.from(signed.signedTransactionBase64, "base64");
  const launchSignature = await connection.sendRawTransaction(raw, {
    skipPreflight: false,
    preflightCommitment: "processed",
  });

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  await confirmTransactionSignature({
    connection,
    signature: launchSignature,
    blockhash,
    lastValidBlockHeight,
  });

  return {
    ok: true,
    tokenMint: tokenInfoResponse.tokenMint,
    metadataUri: tokenInfoResponse.tokenMetadata,
    configKey: configKey,
    launchSignature,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Fee Share Management (CRITICAL for AmpliFi)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Update fee shares for a token
 * 
 * This is called by AmpliFi when attribution scores change.
 * AmpliFi computes the scores, this function pushes them to Bags.
 * 
 * @param tokenMint - The token mint address
 * @param walletWeights - Array of {wallet, bps} where bps sum to 10000
 * @param privyWalletId - Privy wallet ID for signing
 * @param payerPubkey - Public key of the payer wallet
 */
export async function updateFeeShares(
  tokenMint: string,
  walletWeights: Array<{ wallet: string; bps: number }>,
  privyWalletId: string,
  payerPubkey: string
): Promise<{ ok: boolean; configKey?: string; error?: string }> {
  try {
    const connection = getConnection();

    // Validate weights sum to 10000
    const totalBps = walletWeights.reduce((sum, w) => sum + w.bps, 0);
    if (totalBps !== 10000) {
      return { ok: false, error: `Weights must sum to 10000, got ${totalBps}` };
    }

    // Create/update fee share config via Bags API
    if (walletWeights.length > BAGS_MAX_CLAIMERS_NON_LUT) {
      return {
        ok: false,
        error:
          `Too many fee claimers (${walletWeights.length}). Bags requires LUTs when claimers > ${BAGS_MAX_CLAIMERS_NON_LUT}. ` +
          "This adapter currently supports up to 15 fee claimers.",
      };
    }

    const configBody: Record<string, unknown> = {
      payer: payerPubkey,
      baseMint: tokenMint,
      claimersArray: walletWeights.map((w) => w.wallet),
      basisPointsArray: walletWeights.map((w) => w.bps),
    };

    // Include partner config if set - AmpliFi earns 25% of trading fees
    if (BAGS_PARTNER_WALLET && BAGS_PARTNER_CONFIG) {
      configBody.partner = BAGS_PARTNER_WALLET;
      configBody.partnerConfig = BAGS_PARTNER_CONFIG;
    }

    const configResponse: {
      meteoraConfigKey: string;
      transactions?: BagsTxWithBlockhash[];
      bundles?: BagsTxWithBlockhash[][];
    } = await bagsApiFetch("/fee-share/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(configBody),
    });

    const txs: BagsTxWithBlockhash[] = [];
    if (Array.isArray(configResponse.bundles)) {
      for (const bundle of configResponse.bundles) {
        if (Array.isArray(bundle)) txs.push(...bundle);
      }
    }
    if (Array.isArray(configResponse.transactions)) txs.push(...configResponse.transactions);

    for (const item of txs) {
      const unsignedBase64 = bagsTxBase58ToBase64(item.transaction);
      const signed = await privySignSolanaTransaction({ walletId: privyWalletId, transactionBase64: unsignedBase64 });
      const raw = Buffer.from(signed.signedTransactionBase64, "base64");
      const sig = await connection.sendRawTransaction(raw, { skipPreflight: false, preflightCommitment: "processed" });
      await confirmTransactionSignature({
        connection,
        signature: sig,
        blockhash: item.blockhash.blockhash,
        lastValidBlockHeight: item.blockhash.lastValidBlockHeight,
      });
    }

    return { ok: true, configKey: configResponse.meteoraConfigKey };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e) };
  }
}

/**
 * Get claimable balances for a wallet across all tokens
 */
export async function getClaimableBalances(
  walletPubkey: string
): Promise<{ ok: boolean; positions?: ClaimablePosition[]; totalLamports?: number; error?: string }> {
  try {
    const response = await bagsApiFetch(
      `/token-launch/claimable-positions?wallet=${encodeURIComponent(walletPubkey)}`,
      { method: "GET" }
    );

    const positions: ClaimablePosition[] = Array.isArray(response) ? response : response?.positions ?? [];

    let totalLamports = 0;
    for (const pos of positions) {
      const total = decodeMaybeNumber((pos as any).totalClaimableLamportsUserShare);
      if (total > 0) {
        totalLamports += total;
        continue;
      }

      // Fallback to breakdown fields when total isn't present.
      totalLamports += decodeMaybeNumber((pos as any).virtualPoolClaimableLamportsUserShare);
      totalLamports += decodeMaybeNumber((pos as any).dammPoolClaimableLamportsUserShare);
    }

    return {
      ok: true,
      positions,
      totalLamports,
    };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e) };
  }
}

/**
 * Get claimable balances for a specific token
 */
export async function getClaimableBalancesForToken(
  walletPubkey: string,
  tokenMint: string
): Promise<{ ok: boolean; positions?: ClaimablePosition[]; totalLamports?: number; error?: string }> {
  try {
    const result = await getClaimableBalances(walletPubkey);
    if (!result.ok || !result.positions) {
      return result;
    }

    const positions = result.positions.filter((p) => p.baseMint === tokenMint);

    let totalLamports = 0;
    for (const pos of positions) {
      if (pos.totalClaimableLamportsUserShare) {
        totalLamports += Number(pos.totalClaimableLamportsUserShare);
      } else if (pos.virtualPoolClaimableAmount) {
        totalLamports += Number(pos.virtualPoolClaimableAmount);
      }
      if (pos.dammPoolClaimableAmount) {
        totalLamports += Number(pos.dammPoolClaimableAmount);
      }
    }

    return {
      ok: true,
      positions,
      totalLamports,
    };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e) };
  }
}

/**
 * Get claim transactions for a wallet
 * 
 * Returns unsigned transactions (base64) that the user's wallet must sign.
 * This is the key function for the claim flow - no admin signing required.
 */
export async function getClaimTransactions(
  walletPubkey: string,
  tokenMint?: string
): Promise<BagsClaimResult> {
  try {
    // First get claimable positions
    const balancesResult = tokenMint
      ? await getClaimableBalancesForToken(walletPubkey, tokenMint)
      : await getClaimableBalances(walletPubkey);

    if (!balancesResult.ok || !balancesResult.positions || balancesResult.positions.length === 0) {
      return { ok: true, transactions: [], totalClaimableLamports: 0 };
    }

    const base64Result = await getClaimTransactionsBase64(walletPubkey, tokenMint);
    if (!base64Result.ok) {
      return { ok: false, transactions: [], totalClaimableLamports: 0 };
    }

    const transactions: VersionedTransaction[] = [];
    for (const txBase64 of base64Result.transactions) {
      try {
        const txBuffer = Buffer.from(txBase64, "base64");
        transactions.push(VersionedTransaction.deserialize(txBuffer));
      } catch {
        // Skip invalid transactions
      }
    }

    return {
      ok: true,
      transactions,
      totalClaimableLamports: balancesResult.totalLamports || 0,
    };
  } catch (e) {
    return {
      ok: false,
      transactions: [],
      totalClaimableLamports: 0,
    };
  }
}

/**
 * Get claim transactions as base64 strings (for frontend to sign)
 * 
 * This is the preferred method for the claim flow where the user
 * signs the transaction in their wallet.
 */
export async function getClaimTransactionsBase64(
  walletPubkey: string,
  tokenMint?: string
): Promise<{ ok: boolean; transactions: string[]; totalClaimableLamports: number; error?: string }> {
  try {
    // First get claimable positions
    const balancesResult = tokenMint
      ? await getClaimableBalancesForToken(walletPubkey, tokenMint)
      : await getClaimableBalances(walletPubkey);

    if (!balancesResult.ok || !balancesResult.positions || balancesResult.positions.length === 0) {
      return { ok: true, transactions: [], totalClaimableLamports: 0 };
    }

    const outTxs: string[] = [];

    // Bags API requires position details per claim request.
    for (const pos of balancesResult.positions) {
      if (tokenMint && pos.baseMint !== tokenMint) continue;

      const body: any = {
        feeClaimer: walletPubkey,
        tokenMint: pos.baseMint,
        virtualPoolAddress: (pos as any).virtualPoolAddress,
        claimVirtualPoolFees: true,
        claimDammV2Fees: true,
        isCustomFeeVault: Boolean((pos as any).isCustomFeeVault),
      };

      const dammInfo = (pos as any).dammPositionInfo;
      if (dammInfo) {
        body.dammV2Position = dammInfo.position;
        body.dammV2Pool = dammInfo.pool;
        body.dammV2PositionNftAccount = dammInfo.positionNftAccount;
        body.tokenAMint = dammInfo.tokenAMint;
        body.tokenBMint = dammInfo.tokenBMint;
        body.tokenAVault = dammInfo.tokenAVault;
        body.tokenBVault = dammInfo.tokenBVault;
      }

      // Only claim what is actually present
      const vpLamports = decodeMaybeNumber((pos as any).virtualPoolClaimableLamportsUserShare);
      const dammLamports = decodeMaybeNumber((pos as any).dammPoolClaimableLamportsUserShare);
      body.claimVirtualPoolFees = vpLamports > 0;
      body.claimDammV2Fees = dammLamports > 0;

      if (body.isCustomFeeVault) {
        body.feeShareProgramId = (pos as any).programId;
        body.customFeeVaultClaimerA = (pos as any).customFeeVaultClaimerA;
        body.customFeeVaultClaimerB = (pos as any).customFeeVaultClaimerB;
        body.customFeeVaultClaimerSide = (pos as any).customFeeVaultClaimerSide;
      }

      const claimResp: Array<{ tx: string; blockhash: { blockhash: string; lastValidBlockHeight: number } }> =
        await bagsApiFetch("/token-launch/claim-txs/v2", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

      for (const item of claimResp || []) {
        if (item?.tx) outTxs.push(bagsTxBase58ToBase64(item.tx));
      }
    }

    return {
      ok: true,
      transactions: outTxs,
      totalClaimableLamports: balancesResult.totalLamports || 0,
    };
  } catch (e) {
    return {
      ok: false,
      transactions: [],
      totalClaimableLamports: 0,
      error: String((e as Error)?.message ?? e),
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalize wallet weights to ensure they sum to exactly 10000 BPS
 */
export function normalizeWeightsToBps(
  weights: Array<{ wallet: string; score: number }>
): Array<{ wallet: string; bps: number }> {
  const totalScore = weights.reduce((sum, w) => sum + w.score, 0);
  if (totalScore === 0) {
    // If no scores, distribute equally
    const equalBps = Math.floor(10000 / weights.length);
    const remainder = 10000 - equalBps * weights.length;
    return weights.map((w, i) => ({
      wallet: w.wallet,
      bps: equalBps + (i === 0 ? remainder : 0),
    }));
  }

  // Calculate proportional BPS
  let result = weights.map((w) => ({
    wallet: w.wallet,
    bps: Math.floor((w.score / totalScore) * 10000),
  }));

  // Adjust for rounding errors
  const totalBps = result.reduce((sum, w) => sum + w.bps, 0);
  const diff = 10000 - totalBps;
  if (diff !== 0 && result.length > 0) {
    // Add/subtract difference to first entry
    result[0].bps += diff;
  }

  // Filter out zero-weight entries (Bags requires non-zero BPS)
  result = result.filter((w) => w.bps > 0);

  // Re-normalize if we filtered entries
  if (result.length < weights.length) {
    const newTotal = result.reduce((sum, w) => sum + w.bps, 0);
    const scale = 10000 / newTotal;
    result = result.map((w) => ({
      wallet: w.wallet,
      bps: Math.floor(w.bps * scale),
    }));
    const finalTotal = result.reduce((sum, w) => sum + w.bps, 0);
    if (finalTotal !== 10000 && result.length > 0) {
      result[0].bps += 10000 - finalTotal;
    }
  }

  return result;
}

/**
 * Get token info from Bags
 */
export async function getTokenInfo(tokenMint: string): Promise<any> {
  return { tokenMint };
}

// ─────────────────────────────────────────────────────────────────────────────
// Partner Fee Management (AmpliFi platform fees)
// ─────────────────────────────────────────────────────────────────────────────

export interface PartnerStats {
  claimedFees: string;
  unclaimedFees: string;
  claimedFeesLamports: number;
  unclaimedFeesLamports: number;
}

/**
 * Get partner fee statistics (claimed and unclaimed fees)
 * Returns the fees AmpliFi has earned from tokens launched through the platform
 */
export async function getPartnerStats(): Promise<{ ok: boolean; stats?: PartnerStats; error?: string }> {
  if (!BAGS_PARTNER_WALLET) {
    return { ok: false, error: "BAGS_PARTNER_WALLET not configured" };
  }

  try {
    const response = await bagsApiFetch(
      `/fee-share/partner-config/stats?partner=${encodeURIComponent(BAGS_PARTNER_WALLET)}`,
      { method: "GET" }
    );

    return {
      ok: true,
      stats: {
        claimedFees: response.claimedFees ?? "0",
        unclaimedFees: response.unclaimedFees ?? "0",
        claimedFeesLamports: decodeMaybeNumber(response.claimedFees),
        unclaimedFeesLamports: decodeMaybeNumber(response.unclaimedFees),
      },
    };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e) };
  }
}

/**
 * Get transactions to claim accumulated partner fees
 * Returns base64-encoded transactions that need to be signed by the partner wallet
 */
export async function getPartnerClaimTransactions(): Promise<{
  ok: boolean;
  transactions: string[];
  error?: string;
}> {
  if (!BAGS_PARTNER_WALLET) {
    return { ok: false, transactions: [], error: "BAGS_PARTNER_WALLET not configured" };
  }

  try {
    const response: {
      transactions: Array<{
        transaction: string;
        blockhash: { blockhash: string; lastValidBlockHeight: number };
      }>;
    } = await bagsApiFetch("/fee-share/partner-config/claim-tx", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ partnerWallet: BAGS_PARTNER_WALLET }),
    });

    const txs: string[] = [];
    for (const item of response.transactions || []) {
      if (item?.transaction) {
        txs.push(bagsTxBase58ToBase64(item.transaction));
      }
    }

    return { ok: true, transactions: txs };
  } catch (e) {
    return { ok: false, transactions: [], error: String((e as Error)?.message ?? e) };
  }
}

import { Connection, Commitment, Keypair, Transaction } from "@solana/web3.js";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const DEFAULT_RPC_URLS = [
  "https://api.mainnet-beta.solana.com",
  "https://rpc.ankr.com/solana",
  "https://solana-api.projectserum.com",
];

let cachedRpcUrls: string[] | null = null;
let rpcUrlIndex = 0;

function normalizeRpcUrl(input: string | null | undefined): string | null {
  const value = String(input ?? "").trim();
  if (!value) return null;
  return value;
}

function getRpcUrlPool(): string[] {
  if (cachedRpcUrls) return cachedRpcUrls;
  const urls: string[] = [];

  const rawList = normalizeRpcUrl(process.env.SOLANA_RPC_URLS ?? "");
  if (rawList) {
    for (const entry of rawList.split(",")) {
      const normalized = normalizeRpcUrl(entry);
      if (normalized) urls.push(normalized);
    }
  }

  const primary = normalizeRpcUrl(process.env.SOLANA_RPC_URL ?? "");
  if (primary) urls.push(primary);

  for (const fallback of DEFAULT_RPC_URLS) {
    const normalized = normalizeRpcUrl(fallback);
    if (normalized) urls.push(normalized);
  }

  cachedRpcUrls = Array.from(new Set(urls));
  if (!cachedRpcUrls.length) {
    cachedRpcUrls = [DEFAULT_RPC_URLS[0]];
  }
  return cachedRpcUrls;
}

function nextRpcUrl(): string {
  const urls = getRpcUrlPool();
  const url = urls[rpcUrlIndex % urls.length];
  rpcUrlIndex = (rpcUrlIndex + 1) % urls.length;
  return url;
}

function isRateLimitError(error: unknown): boolean {
  const msg = String((error as any)?.message ?? error).toLowerCase();
  return msg.includes("429") || msg.includes("too many requests") || msg.includes("rate limit");
}

export async function withRetry<T>(fn: () => Promise<T>, opts?: { attempts?: number; baseDelayMs?: number }): Promise<T> {
  const attempts = Math.max(1, Math.min(6, opts?.attempts ?? 3));
  const baseDelayMs = Math.max(50, opts?.baseDelayMs ?? 250);

  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i === attempts - 1) break;
      const backoff = baseDelayMs * 2 ** i;
      const jitter = Math.floor(Math.random() * 80);
      await sleep(backoff + jitter);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export function getServerCommitment(): Commitment {
  const raw = (process.env.SOLANA_COMMITMENT ?? "confirmed").trim() as Commitment;
  return raw || "confirmed";
}

export function getConnection(): Connection {
  return new Connection(nextRpcUrl(), getServerCommitment());
}

export function getRpcUrls(): string[] {
  return [...getRpcUrlPool()];
}

export async function withRpcFallback<T>(
  fn: (connection: Connection, rpcUrl: string) => Promise<T>
): Promise<T> {
  const urls = getRpcUrlPool();
  let lastErr: unknown;
  for (const url of urls) {
    const connection = new Connection(url, getServerCommitment());
    try {
      return await fn(connection, url);
    } catch (err) {
      lastErr = err;
      if (isRateLimitError(err)) continue;
      throw err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

function isCommitmentSatisfied(current: string | null | undefined, desired: Commitment): boolean {
  const c = String(current ?? "");
  if (desired === "processed") return c === "processed" || c === "confirmed" || c === "finalized";
  if (desired === "confirmed") return c === "confirmed" || c === "finalized";
  if (desired === "finalized") return c === "finalized";
  return c === desired;
}

export async function confirmSignatureViaRpc(
  connection: Connection,
  signature: string,
  commitment: Commitment,
  opts?: { timeoutMs?: number }
): Promise<void> {
  const sig = String(signature ?? "").trim();
  if (!sig) throw new Error("Missing signature");

  const timeoutMs = Math.max(1_000, Number(opts?.timeoutMs ?? 60_000));
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const st = await withRetry(() => connection.getSignatureStatuses([sig], { searchTransactionHistory: true }));
    const s = st?.value?.[0] as any;

    if (s?.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(s.err)}`);
    }

    const confirmationStatus = typeof s?.confirmationStatus === "string" ? s.confirmationStatus : null;
    if (confirmationStatus && isCommitmentSatisfied(confirmationStatus, commitment)) {
      return;
    }

    await sleep(1200);
  }

  throw new Error("Transaction confirmation timeout");
}

export async function sendAndConfirm(opts: {
  connection: Connection;
  tx: Transaction;
  signers: Keypair[];
}): Promise<string> {
  const { connection, tx, signers } = opts;

  // Use processed for speed, then confirm at configured commitment.
  const processed = "processed" as Commitment;
  const finality = getServerCommitment();

  const latest = await withRetry(() => connection.getLatestBlockhash(processed));
  tx.recentBlockhash = latest.blockhash;
  tx.lastValidBlockHeight = latest.lastValidBlockHeight;

  const sig = await withRetry(() => connection.sendTransaction(tx, signers, { skipPreflight: false, preflightCommitment: processed }));
  await confirmSignatureViaRpc(connection, sig, finality);

  return sig;
}

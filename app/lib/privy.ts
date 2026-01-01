import crypto from "crypto";
import { Connection, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";

import { getSafeErrorMessage } from "./safeError";

function canonicalizeJson(value: any): string {
  if (value === null) return "null";
  const t = typeof value;
  if (t === "string") return JSON.stringify(value);
  if (t === "number") return JSON.stringify(value);
  if (t === "boolean") return value ? "true" : "false";
  if (t !== "object") return "null";

  if (Array.isArray(value)) {
    const parts = value.map((v) => (v === undefined ? "null" : canonicalizeJson(v)));
    return `[${parts.join(",")}]`;
  }

  const obj = value as Record<string, any>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  const parts: string[] = [];
  for (const k of keys) {
    parts.push(`${JSON.stringify(k)}:${canonicalizeJson(obj[k])}`);
  }
  return `{${parts.join(",")}}`;
}

function getPrivyAuthorizationPrivateKeys(): string[] {
  const raw =
    String(process.env.PRIVY_AUTHORIZATION_PRIVATE_KEYS ?? "").trim() ||
    String(process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY ?? "").trim() ||
    String(process.env.PRIVY_AUTHORIZATION_KEY ?? "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function privateKeyToKeyObject(raw: string): crypto.KeyObject {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) throw new Error("Missing authorization private key");

  if (trimmed.includes("BEGIN PRIVATE KEY")) {
    return crypto.createPrivateKey({ key: trimmed, format: "pem" });
  }

  const base64 = trimmed.startsWith("wallet-auth:") ? trimmed.slice("wallet-auth:".length) : trimmed;
  const pem = `-----BEGIN PRIVATE KEY-----\n${base64}\n-----END PRIVATE KEY-----`;
  return crypto.createPrivateKey({ key: pem, format: "pem" });
}

function signPrivyRequest(input: {
  method: "GET" | "POST" | "PATCH";
  url: string;
  appId: string;
  body?: any;
  idempotencyKey?: string;
}): string {
  const payloadHeaders: Record<string, string> = {
    "privy-app-id": input.appId,
    "content-type": "application/json",
  };
  if (input.idempotencyKey) payloadHeaders["privy-idempotency-key"] = input.idempotencyKey;

  const payload = {
    version: 1,
    method: input.method,
    url: input.url,
    body: input.body == null ? {} : input.body,
    headers: payloadHeaders,
  };

  const serializedPayload = canonicalizeJson(payload);
  const buf = Buffer.from(serializedPayload);

  const keys = getPrivyAuthorizationPrivateKeys();
  if (keys.length === 0) return "";

  const sigs: string[] = [];
  for (const k of keys) {
    const keyObj = privateKeyToKeyObject(k);
    const signatureBuffer = crypto.sign("sha256", buf, keyObj);
    sigs.push(signatureBuffer.toString("base64"));
  }
  return sigs.join(",");
}

function mustGetPrivyCreds(): { appId: string; appSecret: string } {
  const appId = String(process.env.PRIVY_APP_ID ?? "").trim();
  const appSecret = String(process.env.PRIVY_APP_SECRET ?? "").trim();
  if (!appId || !appSecret) {
    throw new Error("PRIVY_APP_ID and PRIVY_APP_SECRET are required");
  }
  return { appId, appSecret };
}

function basicAuthHeader(appId: string, appSecret: string): string {
  const raw = `${appId}:${appSecret}`;
  return `Basic ${Buffer.from(raw, "utf8").toString("base64")}`;
}

function idempotencyKey(prefix: string): string {
  const rand = crypto.randomBytes(12).toString("hex");
  return `${prefix}:${rand}`;
}

async function privyFetchJson(input: {
  method: "GET" | "POST" | "PATCH";
  path: string;
  body?: any;
  idempotencyKey?: string;
}): Promise<any> {
  const { appId, appSecret } = mustGetPrivyCreds();

  const url = `https://api.privy.io${input.path}`;

  const headers: Record<string, string> = {
    authorization: basicAuthHeader(appId, appSecret),
    "content-type": "application/json",
    "privy-app-id": appId,
  };

  if (input.idempotencyKey) {
    headers["privy-idempotency-key"] = input.idempotencyKey;
    headers["idempotency-key"] = input.idempotencyKey;
  }

  if (input.method !== "GET") {
    const sig = signPrivyRequest({
      method: input.method,
      url,
      appId,
      body: input.body,
      idempotencyKey: input.idempotencyKey,
    });
    if (sig) headers["privy-authorization-signature"] = sig;
  }

  const res = await fetch(url, {
    method: input.method,
    headers,
    body: input.body == null ? undefined : JSON.stringify(input.body),
    cache: "no-store",
  });

  const json = (await res.json().catch(() => null)) as any;
  if (!res.ok) {
    const msg = typeof json?.error === "string" && json.error.length ? json.error : `Privy request failed (${res.status})`;
    throw new Error(getSafeErrorMessage(msg));
  }

  return json;
}

export async function privyCreateSolanaWallet(): Promise<{ walletId: string; address: string }> {
  const json = await privyFetchJson({
    method: "POST",
    path: "/v1/wallets",
    body: { chain_type: "solana" },
    idempotencyKey: idempotencyKey("cts:createWallet"),
  });

  const walletId = String(json?.id ?? "").trim();
  const address = String(json?.address ?? "").trim();

  if (!walletId || !address) {
    throw new Error("Privy returned an invalid wallet response");
  }

  return { walletId, address };
}

export async function privySignAndSendSolanaTransaction(input: {
  walletId: string;
  caip2: string;
  transactionBase64: string;
}): Promise<{ signature: string; transactionId?: string }> {
  const walletId = String(input.walletId ?? "").trim();
  const caip2 = String(input.caip2 ?? "").trim();
  const tx = String(input.transactionBase64 ?? "").trim();

  if (!walletId) throw new Error("walletId required");
  if (!caip2) throw new Error("caip2 required");
  if (!tx) throw new Error("transactionBase64 required");

  const json = await privyFetchJson({
    method: "POST",
    path: `/v1/wallets/${encodeURIComponent(walletId)}/rpc`,
    body: {
      method: "signAndSendTransaction",
      caip2,
      sponsor: false,
      params: {
        transaction: tx,
        encoding: "base64",
      },
    },
    idempotencyKey: idempotencyKey("cts:signAndSendSolana"),
  });

  const signature = String(json?.data?.hash ?? "").trim();
  const transactionId = json?.data?.transaction_id != null ? String(json.data.transaction_id) : undefined;

  if (!signature) {
    throw new Error("Privy did not return a transaction hash");
  }

  return { signature, transactionId };
}

export async function privyFundWalletFromFeePayer(input: {
  toPubkey: PublicKey;
  lamports: number;
}): Promise<{ ok: true; signature: string } | { ok: false; error: string }> {
  const { toPubkey, lamports } = input;
  
  const feePayerSecret = String(process.env.ESCROW_FEE_PAYER_SECRET_KEY ?? "").trim();
  if (!feePayerSecret) {
    return { ok: false, error: "ESCROW_FEE_PAYER_SECRET_KEY is required for automated launches" };
  }

  try {
    // Dynamic import to avoid circular dependency
    const { keypairFromBase58Secret, getConnection } = await import("./solana");
    const { withRetry } = await import("./rpc");
    
    const feePayer = keypairFromBase58Secret(feePayerSecret);
    const connection = getConnection();
    
    const balance = await withRetry(() => connection.getBalance(feePayer.publicKey, "confirmed"));
    if (balance < lamports + 5000) {
      return { ok: false, error: `Fee payer has insufficient balance (${balance} lamports, need ${lamports + 5000})` };
    }

    const { blockhash, lastValidBlockHeight } = await withRetry(() => connection.getLatestBlockhash("processed"));
    
    const tx = new Transaction();
    tx.recentBlockhash = blockhash;
    tx.lastValidBlockHeight = lastValidBlockHeight;
    tx.feePayer = feePayer.publicKey;
    tx.add(
      SystemProgram.transfer({
        fromPubkey: feePayer.publicKey,
        toPubkey,
        lamports,
      })
    );

    tx.sign(feePayer);
    
    const signature = await withRetry(() => 
      connection.sendRawTransaction(tx.serialize(), { skipPreflight: false })
    );
    
    await withRetry(() => 
      connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed"),
      { attempts: 4, baseDelayMs: 350 }
    );

    return { ok: true, signature };
  } catch (e) {
    return { ok: false, error: getSafeErrorMessage(e) };
  }
}

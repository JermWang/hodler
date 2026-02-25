import crypto from "crypto";

import { getSafeErrorMessage, redactSensitive } from "./safeError";

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
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
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
    const data = new Uint8Array(buf);
    const signatureBuffer = crypto.sign("sha256", data, keyObj);
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
  return `Basic ${Buffer.from(`${appId}:${appSecret}`, "utf8").toString("base64")}`;
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
    const sig = signPrivyRequest({ method: input.method, url, appId, body: input.body, idempotencyKey: input.idempotencyKey });
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
    const rawMsg = typeof json?.error === "string" && json.error.length ? json.error : `Privy request failed (${res.status})`;
    const rawBody = json == null ? "" : (() => { try { return JSON.stringify(json); } catch { return String(json); } })();
    const rawError = redactSensitive(`${rawMsg}${rawBody ? ` | body=${rawBody}` : ""}`);
    const safeMsg = getSafeErrorMessage(`Privy request failed (${res.status}): ${rawMsg}`);
    const err: any = new Error(safeMsg);
    err.status = res.status;
    err.rawError = rawError.length > 1200 ? rawError.slice(0, 1200) : rawError;
    throw err;
  }
  return json;
}

export async function privyCreateSolanaWalletWithIdempotencyKey(input: {
  idempotencyKey: string;
}): Promise<{ walletId: string; address: string }> {
  const key = String(input.idempotencyKey ?? "").trim();
  if (!key) throw new Error("idempotencyKey required");
  const json = await privyFetchJson({
    method: "POST",
    path: "/v1/wallets",
    body: { chain_type: "solana" },
    idempotencyKey: key,
  });
  const walletId = String(json?.id ?? "").trim();
  const address = String(json?.address ?? "").trim();
  if (!walletId || !address) throw new Error("Privy returned an invalid wallet response");
  return { walletId, address };
}

export async function privySignSolanaTransaction(input: {
  walletId: string;
  transactionBase64: string;
}): Promise<{ signedTransactionBase64: string }> {
  const walletId = String(input.walletId ?? "").trim();
  const transactionBase64 = String(input.transactionBase64 ?? "").trim();
  if (!walletId) throw new Error("walletId required");
  if (!transactionBase64) throw new Error("transactionBase64 required");
  const json = await privyFetchJson({
    method: "POST",
    path: `/v1/wallets/${encodeURIComponent(walletId)}/rpc`,
    body: {
      method: "signTransaction",
      caip2: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
      params: { transaction: transactionBase64 },
    },
  });
  const signed = String(json?.data?.signedTransaction ?? json?.signedTransaction ?? "").trim();
  if (!signed) throw new Error("Privy returned no signed transaction");
  return { signedTransactionBase64: signed };
}

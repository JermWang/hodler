import crypto from "crypto";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { Keypair } from "@solana/web3.js";

import { getPool, hasDatabase } from "./db";

function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

function sha256Bytes(input: string): Uint8Array {
  const h = crypto.createHash("sha256");
  h.update(input, "utf8");
  return new Uint8Array(h.digest());
}

function encryptB58Secret(plainB58: string): string {
  const secret = String(process.env.ESCROW_DB_SECRET ?? "").trim();
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("ESCROW_DB_SECRET is required in production");
    }
    return plainB58;
  }

  const key = sha256Bytes(secret);
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const msg = new TextEncoder().encode(plainB58);
  const box = nacl.secretbox(msg, nonce, key);

  const packed = new Uint8Array(nonce.length + box.length);
  packed.set(nonce, 0);
  packed.set(box, nonce.length);
  return `enc:${Buffer.from(packed).toString("base64")}`;
}

function decryptB58Secret(stored: string): string {
  const trimmed = String(stored ?? "").trim();
  if (!trimmed.startsWith("enc:")) return trimmed;

  const secret = String(process.env.ESCROW_DB_SECRET ?? "").trim();
  if (!secret) throw new Error("ESCROW_DB_SECRET is required to decrypt vanity secrets");

  const key = sha256Bytes(secret);
  const packed = Buffer.from(trimmed.slice("enc:".length), "base64");
  const nonce = new Uint8Array(packed.subarray(0, nacl.secretbox.nonceLength));
  const box = new Uint8Array(packed.subarray(nacl.secretbox.nonceLength));
  const opened = nacl.secretbox.open(box, nonce, key);
  if (!opened) throw new Error("Failed to decrypt vanity secret");
  return new TextDecoder().decode(opened);
}

let ensuredSchema: Promise<void> | null = null;

async function ensureSchema(): Promise<void> {
  if (!hasDatabase()) return;
  if (ensuredSchema) return ensuredSchema;

  ensuredSchema = (async () => {
    const pool = getPool();
    await pool.query(`
      create table if not exists public.vanity_keypairs (
        id bigserial primary key,
        suffix text not null,
        public_key text not null unique,
        secret_key text not null,
        created_at_unix bigint not null,
        reserved_at_unix bigint null,
        used_at_unix bigint null
      );
      create index if not exists vanity_keypairs_suffix_used_idx on public.vanity_keypairs(suffix, used_at_unix);
    `);

    await pool.query(`alter table public.vanity_keypairs add column if not exists reserved_at_unix bigint null;`);
    await pool.query(`create index if not exists vanity_keypairs_suffix_reserved_idx on public.vanity_keypairs(suffix, reserved_at_unix);`);
  })().catch((e) => {
    ensuredSchema = null;
    throw e;
  });

  return ensuredSchema;
}

export async function insertVanityKeypair(input: { suffix: string; keypair: Keypair }): Promise<void> {
  if (!hasDatabase()) return;
  await ensureSchema();
  const pool = getPool();

  const suffix = String(input.suffix ?? "").trim() || "AMP";
  const publicKey = input.keypair.publicKey.toBase58();
  const secretB58 = bs58.encode(Uint8Array.from(input.keypair.secretKey));
  const storedSecret = encryptB58Secret(secretB58);

  await pool.query(
    `insert into public.vanity_keypairs (suffix, public_key, secret_key, created_at_unix) values ($1,$2,$3,$4)
     on conflict (public_key) do nothing`,
    [suffix, publicKey, storedSecret, String(nowUnix())]
  );
}

export async function popVanityKeypair(input: { suffix: string }): Promise<Keypair | null> {
  if (!hasDatabase()) return null;
  await ensureSchema();

  const suffix = String(input.suffix ?? "").trim() || "AMP";
  const pool = getPool();
  const ts = nowUnix();

  const { rows } = await pool.query(
    `with next as (
      select id
      from public.vanity_keypairs
      where suffix = $1 and used_at_unix is null and reserved_at_unix is null
      order by created_at_unix asc
      limit 1
      for update skip locked
    )
    update public.vanity_keypairs v
    set reserved_at_unix = $2
    from next
    where v.id = next.id
    returning v.secret_key as secret_key`,
    [suffix, String(ts)]
  );

  const row = rows?.[0];
  const stored = String(row?.secret_key ?? "").trim();
  if (!stored) return null;

  const secretB58 = decryptB58Secret(stored);
  const secretBytes = bs58.decode(secretB58);
  return Keypair.fromSecretKey(secretBytes);
}

export async function releaseReservedVanityKeypair(input: { publicKey: string }): Promise<void> {
  if (!hasDatabase()) return;
  await ensureSchema();
  const pool = getPool();
  const pubkey = String(input.publicKey ?? "").trim();
  if (!pubkey) return;

  await pool.query(
    `update public.vanity_keypairs
     set reserved_at_unix = null
     where public_key = $1 and used_at_unix is null`,
    [pubkey]
  );
}

export async function markVanityKeypairUsed(input: { publicKey: string }): Promise<void> {
  if (!hasDatabase()) return;
  await ensureSchema();
  const pool = getPool();
  const pubkey = String(input.publicKey ?? "").trim();
  if (!pubkey) return;

  const ts = nowUnix();
  await pool.query(
    `update public.vanity_keypairs
     set used_at_unix = $2
     where public_key = $1 and used_at_unix is null`,
    [pubkey, String(ts)]
  );
}

function median(values: number[]): number | null {
  const nums = values.filter((n) => Number.isFinite(n)).slice().sort((a, b) => a - b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  if (nums.length % 2 === 1) return nums[mid];
  return (nums[mid - 1] + nums[mid]) / 2;
}

export async function getVanityAvailableCount(input: { suffix: string }): Promise<number> {
  if (!hasDatabase()) return 0;
  await ensureSchema();
  const pool = getPool();
  const suffix = String(input.suffix ?? "").trim() || "AMP";
  const res = await pool.query(
    `select count(*)::int as count
     from public.vanity_keypairs
     where suffix = $1 and used_at_unix is null and reserved_at_unix is null`,
    [suffix]
  );
  return Math.max(0, Number(res.rows?.[0]?.count ?? 0) || 0);
}

export async function estimateVanityRefillSeconds(input: { suffix: string; needed?: number }): Promise<{
  secondsPerMint: number | null;
  estimatedSecondsUntilReady: number | null;
  sampleSize: number;
}> {
  if (!hasDatabase()) return { secondsPerMint: null, estimatedSecondsUntilReady: null, sampleSize: 0 };
  await ensureSchema();
  const pool = getPool();
  const suffix = String(input.suffix ?? "").trim() || "AMP";
  const needed = Math.max(0, Number(input.needed ?? 1) || 1);

  const res = await pool.query(
    `select created_at_unix
     from public.vanity_keypairs
     where suffix = $1
     order by created_at_unix desc
     limit 25`,
    [suffix]
  );

  const times = (res.rows ?? [])
    .map((r) => Number(r.created_at_unix ?? 0) || 0)
    .filter((n) => n > 0);

  const deltas: number[] = [];
  for (let i = 0; i + 1 < times.length; i++) {
    const d = times[i] - times[i + 1];
    if (d > 0 && d < 60 * 60) deltas.push(d);
  }

  const secondsPerMint = median(deltas);
  if (secondsPerMint == null) {
    return { secondsPerMint: null, estimatedSecondsUntilReady: null, sampleSize: deltas.length };
  }

  const estimatedSecondsUntilReady = Math.max(0, Math.round(secondsPerMint * needed));
  return { secondsPerMint, estimatedSecondsUntilReady, sampleSize: deltas.length };
}

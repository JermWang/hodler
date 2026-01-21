import { Keypair } from "@solana/web3.js";

import { getPool } from "../app/lib/db";
import { insertVanityKeypair } from "../app/lib/vanityPool";

function intEnv(name: string, fallback: number): number {
  const raw = Number(process.env[name] ?? "");
  if (Number.isFinite(raw) && raw >= 0) return Math.floor(raw);
  return fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function now(): string {
  return new Date().toISOString();
}

async function ensureVanitySchema(): Promise<void> {
  const pool = getPool();
  await pool.query(`
    create table if not exists public.vanity_keypairs (
      id bigserial primary key,
      suffix text not null,
      public_key text not null unique,
      secret_key text not null,
      created_at_unix bigint not null,
      used_at_unix bigint null
    );
    create index if not exists vanity_keypairs_suffix_used_idx on public.vanity_keypairs(suffix, used_at_unix);
  `);
}

async function getAvailableCount(suffix: string): Promise<number> {
  await ensureVanitySchema();
  const pool = getPool();
  const res = await pool.query(
    "select count(*)::bigint as n from public.vanity_keypairs where suffix=$1 and used_at_unix is null",
    [suffix]
  );
  return Number(res.rows?.[0]?.n ?? 0);
}

async function generateOneMatchingSuffix(params: { suffix: string }): Promise<Keypair> {
  const suffix = params.suffix;
  const suffixLower = suffix.toLowerCase();

  const batchSize = 50_000;
  let attempts = 0;

  while (true) {
    for (let i = 0; i < batchSize; i++) {
      const kp = Keypair.generate();
      attempts++;
      const pub = kp.publicKey.toBase58();

      const matches =
        suffixLower === "pump" ? pub.endsWith("pump") : pub.toLowerCase().endsWith(suffixLower);

      if (matches) {
        console.log(`[vanity-worker] ${now()} found match`, {
          suffix,
          publicKey: pub,
          attempts,
        });
        return kp;
      }
    }

    if (attempts % (batchSize * 4) === 0) {
      console.log(`[vanity-worker] ${now()} still searching`, { suffix, attempts });
      await sleep(0);
    }
  }
}

async function main(): Promise<void> {
  const suffix = String(process.env.VANITY_WORKER_SUFFIX ?? "pump").trim() || "pump";
  const minAvailable = intEnv("VANITY_WORKER_MIN_AVAILABLE", 10);
  const targetAvailable = intEnv("VANITY_WORKER_TARGET_AVAILABLE", 50);
  const idleSleepMs = intEnv("VANITY_WORKER_IDLE_SLEEP_MS", 30_000);

  if (targetAvailable <= 0) {
    throw new Error("VANITY_WORKER_TARGET_AVAILABLE must be > 0");
  }

  if (minAvailable >= targetAvailable) {
    throw new Error("VANITY_WORKER_MIN_AVAILABLE must be less than VANITY_WORKER_TARGET_AVAILABLE");
  }

  console.log(`[vanity-worker] ${now()} starting`, {
    suffix,
    minAvailable,
    targetAvailable,
    idleSleepMs,
    nodeEnv: process.env.NODE_ENV,
  });

  let shuttingDown = false;
  process.on("SIGTERM", () => {
    shuttingDown = true;
  });
  process.on("SIGINT", () => {
    shuttingDown = true;
  });

  while (!shuttingDown) {
    const available = await getAvailableCount(suffix);
    console.log(`[vanity-worker] ${now()} pool status`, { suffix, available });

    if (available > minAvailable) {
      await sleep(idleSleepMs);
      continue;
    }

    const need = Math.max(0, targetAvailable - available);
    console.log(`[vanity-worker] ${now()} topping up`, { suffix, need });

    for (let i = 0; i < need && !shuttingDown; i++) {
      const keypair = await generateOneMatchingSuffix({ suffix });
      await insertVanityKeypair({ suffix, keypair });
    }

    await sleep(5_000);
  }

  console.log(`[vanity-worker] ${now()} shutdown requested`);
}

main().catch((e) => {
  console.error("[vanity-worker] fatal", (e as Error)?.message ?? e);
  process.exitCode = 1;
});

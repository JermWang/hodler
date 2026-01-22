import { Keypair } from "@solana/web3.js";

import { getPool } from "../app/lib/db";
import { insertVanityKeypair } from "../app/lib/vanityPool";
import { isValidAmpVanityAddress } from "../app/lib/vanityKeypair";

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
    
    create table if not exists public.vanity_worker_flags (
      key text primary key,
      value text,
      updated_at_unix bigint
    );
  `);
}

async function checkForceGenerate(suffix: string): Promise<boolean> {
  const pool = getPool();
  const res = await pool.query(
    "select value from public.vanity_worker_flags where key = $1",
    [`force_generate_${suffix}`]
  );
  return res.rows?.[0]?.value === "true";
}

async function clearForceGenerate(suffix: string): Promise<void> {
  const pool = getPool();
  await pool.query(
    "delete from public.vanity_worker_flags where key = $1",
    [`force_generate_${suffix}`]
  );
}

async function getAvailableCount(suffix: string): Promise<number> {
  await ensureVanitySchema();
  const pool = getPool();
  const res = await pool.query(
    "select count(*)::bigint as n from public.vanity_keypairs where suffix=$1 and used_at_unix is null and reserved_at_unix is null",
    [suffix]
  );
  return Number(res.rows?.[0]?.n ?? 0);
}

async function generateOneMatchingSuffix(params: { suffix: string }): Promise<Keypair> {
  const suffix = params.suffix;
  const suffixUpper = suffix.toUpperCase();
  if (suffixUpper !== "AMP") {
    throw new Error('Only vanity suffix "AMP" is supported');
  }

  const batchSize = 50_000;
  let attempts = 0;

  while (true) {
    for (let i = 0; i < batchSize; i++) {
      const kp = Keypair.generate();
      attempts++;
      const pub = kp.publicKey.toBase58();

      // Must end with AMP and have lowercase char before it (to avoid words like DAMP, RAMP)
      if (isValidAmpVanityAddress(pub)) {
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
  const rawSuffix = String(process.env.VANITY_WORKER_SUFFIX ?? "AMP").trim() || "AMP";
  if (rawSuffix.toUpperCase() !== "AMP") {
    throw new Error('VANITY_WORKER_SUFFIX must be "AMP"');
  }
  if (rawSuffix !== "AMP") {
    throw new Error('VANITY_WORKER_SUFFIX must be uppercase "AMP"');
  }
  const suffix = "AMP";
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
    const forceGenerate = await checkForceGenerate(suffix);
    
    console.log(`[vanity-worker] ${now()} pool status`, { suffix, available, forceGenerate });

    // Generate if below min OR if force flag is set and below target
    const shouldGenerate = available <= minAvailable || (forceGenerate && available < targetAvailable);
    
    if (!shouldGenerate) {
      await sleep(idleSleepMs);
      continue;
    }

    console.log(`[vanity-worker] ${now()} topping up`, { suffix, targetAvailable, forceGenerate });

    while (!shuttingDown) {
      const currentAvailable = await getAvailableCount(suffix);
      if (currentAvailable >= targetAvailable) {
        // Clear force flag when we reach target
        await clearForceGenerate(suffix);
        console.log(`[vanity-worker] ${now()} reached target, cleared force flag`, { suffix, available: currentAvailable });
        break;
      }

      const keypair = await generateOneMatchingSuffix({ suffix });
      await insertVanityKeypair({ suffix, keypair });

      const afterInsertAvailable = await getAvailableCount(suffix);
      console.log(`[vanity-worker] ${now()} inserted`, { suffix, available: afterInsertAvailable });
    }

    await sleep(5_000);
  }

  console.log(`[vanity-worker] ${now()} shutdown requested`);
}

main().catch((e) => {
  console.error("[vanity-worker] fatal", (e as Error)?.message ?? e);
  process.exitCode = 1;
});

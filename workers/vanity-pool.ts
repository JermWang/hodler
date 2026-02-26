/**
 * Vanity Pool Background Worker (multi-threaded)
 *
 * Keeps the vanity_keypairs table topped up so launches never stall.
 * Spawns one worker_thread per CPU core for parallel keypair grinding.
 *
 * Run via: npx tsx workers/vanity-pool.ts
 *
 * Env vars required:
 *   DATABASE_URL          - Postgres connection string
 *   ESCROW_DB_SECRET      - Encryption key for stored secret keys (required in production)
 *
 * Optional env vars:
 *   VANITY_POOL_TARGET    - Target available keypairs per suffix (default: 50)
 *   VANITY_POOL_THRESHOLD - Refill trigger threshold (default: 10)
 *   VANITY_POLL_INTERVAL  - Seconds between pool checks (default: 30)
 *   VANITY_THREAD_COUNT   - Override thread count (default: CPU cores - 1, min 1)
 */

import { cpus } from "os";
import { resolve } from "path";
import { fork, ChildProcess } from "child_process";
import { Keypair } from "@solana/web3.js";

import { insertVanityKeypair, getVanityAvailableCount } from "../app/lib/vanityPool";

const SUFFIXES: { suffix: string; caseSensitive: boolean }[] = [
  { suffix: "HODL", caseSensitive: true },
  { suffix: "pump", caseSensitive: true },
];

function envInt(name: string, fallback: number): number {
  const raw = Number(process.env[name] ?? "");
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
}

const TARGET = envInt("VANITY_POOL_TARGET", 50);
const THRESHOLD = envInt("VANITY_POOL_THRESHOLD", 10);
const POLL_INTERVAL_S = envInt("VANITY_POLL_INTERVAL", 30);
const THREAD_COUNT = envInt("VANITY_THREAD_COUNT", Math.max(1, cpus().length - 1));

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ts(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

let shuttingDown = false;

// ---------- Process management ----------

const CHILD_PATH = resolve(__dirname, "vanity-child.js");

interface ChildHandle {
  proc: ChildProcess;
  totalAttempts: number;
}

function spawnChild(): ChildHandle {
  // Plain .js child - no tsx needed, use empty execArgv to avoid inheriting loader flags
  const proc = fork(CHILD_PATH, [], {
    execArgv: [],
    stdio: ["ignore", "inherit", "inherit", "ipc"],
  });
  return { proc, totalAttempts: 0 };
}

/**
 * Spawn N child processes and grind until `needed` keypairs are found.
 * Returns an array of Keypairs.
 */
async function grindParallel(
  suffix: string,
  caseSensitive: boolean,
  needed: number,
): Promise<Keypair[]> {
  const found: Keypair[] = [];
  const children: ChildHandle[] = [];
  const startTime = Date.now();
  let lastProgressLog = Date.now();
  let resolved = false;

  return new Promise<Keypair[]>((resolvePromise) => {
    function stopAll(): void {
      if (resolved) return;
      resolved = true;
      for (const c of children) {
        try { c.proc.send({ type: "stop" }); } catch {}
        setTimeout(() => { try { c.proc.kill(); } catch {} }, 1000);
      }
      resolvePromise(found);
    }

    for (let i = 0; i < THREAD_COUNT; i++) {
      const c = spawnChild();
      children.push(c);

      c.proc.on("message", (msg: any) => {
        if (msg?.type === "found") {
          if (found.length >= needed) return;
          try {
            const secretBytes = new Uint8Array(msg.secretKey);
            const keypair = Keypair.fromSecretKey(secretBytes);
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`  [${ts()}] Found ${suffix}: ${msg.publicKey} (${elapsed}s, child ${i})`);
            found.push(keypair);
            if (found.length >= needed || shuttingDown) stopAll();
          } catch (e: any) {
            console.error(`  [${ts()}] Bad keypair from child ${i}:`, e?.message);
          }
        } else if (msg?.type === "progress") {
          c.totalAttempts = msg.attempts;
          const total = children.reduce((sum, ch) => sum + ch.totalAttempts, 0);

          const now = Date.now();
          if (now - lastProgressLog > 10_000) {
            const elapsed = ((now - startTime) / 1000).toFixed(1);
            const rate = Math.round(total / ((now - startTime) / 1000));
            console.log(
              `  [${ts()}] ${suffix}: ${total.toLocaleString()} attempts, ` +
              `${rate.toLocaleString()}/s, ${found.length}/${needed} found, ${elapsed}s`
            );
            lastProgressLog = now;
          }
        }
      });

      c.proc.on("error", (err: Error) => {
        console.error(`  [${ts()}] Child ${i} error:`, err.message);
      });

      c.proc.on("exit", (code: number | null) => {
        if (code !== 0 && code !== null && !shuttingDown) {
          console.warn(`  [${ts()}] Child ${i} exited with code ${code}`);
        }
        // If all children exited and we haven't resolved yet, resolve with what we have
        const allDead = children.every((ch) => ch.proc.exitCode !== null);
        if (allDead && !resolved) stopAll();
      });

      // Start grinding
      c.proc.send({ type: "start", suffix, caseSensitive });
    }
  });
}

// ---------- Pool refill logic ----------

async function refillSuffix(suffix: string, caseSensitive: boolean): Promise<number> {
  const available = await getVanityAvailableCount({ suffix });
  if (available > THRESHOLD) {
    return 0;
  }

  const needed = TARGET - available;
  console.log(`[${ts()}] ${suffix}: ${available} available (threshold=${THRESHOLD}), need ${needed} to reach ${TARGET}`);
  console.log(`[${ts()}] Spawning ${THREAD_COUNT} threads...`);

  const keypairs = await grindParallel(suffix, caseSensitive, needed);

  let inserted = 0;
  for (const keypair of keypairs) {
    if (shuttingDown) break;
    try {
      await insertVanityKeypair({ suffix, keypair });
      inserted++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[${ts()}] Insert failed for ${keypair.publicKey.toBase58()}: ${msg}`);
    }
  }

  return inserted;
}

// ---------- Main loop ----------

async function runLoop(): Promise<void> {
  console.log(`[${ts()}] Vanity pool worker started (multi-threaded)`);
  console.log(`  Threads: ${THREAD_COUNT} (${cpus().length} CPUs detected)`);
  console.log(`  Target: ${TARGET} per suffix, threshold: ${THRESHOLD}, poll: ${POLL_INTERVAL_S}s`);
  console.log(`  Suffixes: ${SUFFIXES.map((s) => s.suffix).join(", ")}`);

  while (!shuttingDown) {
    try {
      for (const { suffix, caseSensitive } of SUFFIXES) {
        if (shuttingDown) break;
        const generated = await refillSuffix(suffix, caseSensitive);
        if (generated > 0) {
          const now = await getVanityAvailableCount({ suffix });
          console.log(`[${ts()}] ${suffix}: inserted ${generated}, now ${now} available`);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[${ts()}] Worker error: ${msg}`);
      await sleep(10_000);
    }

    if (!shuttingDown) {
      await sleep(POLL_INTERVAL_S * 1000);
    }
  }

  console.log(`[${ts()}] Vanity pool worker stopped`);
}

// Graceful shutdown
process.on("SIGINT", () => {
  console.log(`\n[${ts()}] SIGINT received, shutting down...`);
  shuttingDown = true;
});
process.on("SIGTERM", () => {
  console.log(`[${ts()}] SIGTERM received, shutting down...`);
  shuttingDown = true;
});

runLoop().catch((err) => {
  console.error(`[${ts()}] Fatal error:`, err);
  process.exit(1);
});

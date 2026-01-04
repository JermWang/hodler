import { getPool, hasDatabase } from "./db";

type CacheRow = {
  mint: string;
  priceUsd: number;
  updatedAtUnix: number;
};

const mem = {
  prices: new Map<string, CacheRow>(),
};

let ensuredSchema: Promise<void> | null = null;

function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

function ttlSeconds(): number {
  const raw = Number(process.env.JUPITER_PRICE_CACHE_TTL_SECONDS ?? "");
  if (Number.isFinite(raw) && raw > 0) return Math.floor(raw);
  return 60;
}

function staleTtlSeconds(): number {
  const raw = Number(process.env.JUPITER_PRICE_STALE_TTL_SECONDS ?? "");
  if (Number.isFinite(raw) && raw > 0) return Math.floor(raw);
  return 15 * 60;
}

async function ensureSchema(): Promise<void> {
  if (!hasDatabase()) return;
  if (ensuredSchema) return ensuredSchema;

  ensuredSchema = (async () => {
    const pool = getPool();
    await pool.query(`
      create table if not exists token_price_cache (
        mint text primary key,
        price_usd double precision not null,
        updated_at_unix bigint not null
      );
    `);
  })().catch((e) => {
    ensuredSchema = null;
    throw e;
  });

  return ensuredSchema;
}

export async function getCachedJupiterPriceUsd(mint: string): Promise<number | null> {
  await ensureSchema();

  const t = nowUnix();
  const ttl = ttlSeconds();

  if (!hasDatabase()) {
    const row = mem.prices.get(mint);
    if (!row) return null;
    if (t - row.updatedAtUnix > ttl) return null;
    return row.priceUsd;
  }

  const pool = getPool();
  const res = await pool.query("select price_usd, updated_at_unix from token_price_cache where mint=$1", [mint]);
  const row = res.rows[0];
  if (!row) return null;
  const updatedAtUnix = Number(row.updated_at_unix);
  const priceUsd = Number(row.price_usd);
  if (!Number.isFinite(updatedAtUnix) || !Number.isFinite(priceUsd)) return null;
  if (t - updatedAtUnix > ttl) return null;
  return priceUsd;
}

export async function getCachedJupiterPriceUsdAllowStale(mint: string): Promise<number | null> {
  await ensureSchema();

  const t = nowUnix();
  const maxAge = staleTtlSeconds();

  if (!hasDatabase()) {
    const row = mem.prices.get(mint);
    if (!row) return null;
    if (t - row.updatedAtUnix > maxAge) return null;
    return row.priceUsd;
  }

  const pool = getPool();
  const res = await pool.query("select price_usd, updated_at_unix from token_price_cache where mint=$1", [mint]);
  const row = res.rows[0];
  if (!row) return null;
  const updatedAtUnix = Number(row.updated_at_unix);
  const priceUsd = Number(row.price_usd);
  if (!Number.isFinite(updatedAtUnix) || !Number.isFinite(priceUsd)) return null;
  if (t - updatedAtUnix > maxAge) return null;
  return priceUsd;
}

export async function setCachedJupiterPriceUsd(mint: string, priceUsd: number): Promise<void> {
  await ensureSchema();

  const updatedAtUnix = nowUnix();

  if (!hasDatabase()) {
    mem.prices.set(mint, { mint, priceUsd, updatedAtUnix });
    return;
  }

  const pool = getPool();
  await pool.query(
    `insert into token_price_cache (mint, price_usd, updated_at_unix)
     values ($1,$2,$3)
     on conflict (mint) do update set price_usd=excluded.price_usd, updated_at_unix=excluded.updated_at_unix`,
    [mint, priceUsd, String(updatedAtUnix)]
  );
}

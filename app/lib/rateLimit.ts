import { getPool, hasDatabase } from "./db";

type RateLimitConfig = {
  keyPrefix: string;
  limit: number;
  windowSeconds: number;
};

type RateLimitEntry = {
  count: number;
  resetAtUnix: number;
};

let ensuredSchema: Promise<void> | null = null;

async function ensureSchema(): Promise<void> {
  if (!hasDatabase()) return;
  if (ensuredSchema) return ensuredSchema;

  ensuredSchema = (async () => {
    const pool = getPool();
    await pool.query(`
      create table if not exists public.rate_limits (
        key text not null,
        window_start_unix bigint not null,
        count integer not null,
        reset_at_unix bigint not null,
        updated_at_unix bigint not null,
        primary key (key, window_start_unix)
      );
      create index if not exists rate_limits_reset_idx on public.rate_limits(reset_at_unix);
    `);
  })().catch((e) => {
    ensuredSchema = null;
    throw e;
  });

  return ensuredSchema;
}

function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

function safeHasDatabase(): boolean {
  try {
    return hasDatabase();
  } catch {
    return false;
  }
}

function getHeader(req: Request, name: string): string {
  return String(req.headers.get(name) ?? "").trim();
}

export function getClientIp(req: Request): string {
  const xff = getHeader(req, "x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || xff.trim();

  const realIp = getHeader(req, "x-real-ip");
  if (realIp) return realIp;

  const cfIp = getHeader(req, "cf-connecting-ip");
  if (cfIp) return cfIp;

  const trueClientIp = getHeader(req, "true-client-ip");
  if (trueClientIp) return trueClientIp;

  const ua = getHeader(req, "user-agent");
  return ua ? `unknown:${ua.slice(0, 80)}` : "unknown";
}

function getStore(): Map<string, RateLimitEntry> {
  const g = globalThis as any;
  if (!g.__cts_rate_limit_store) {
    g.__cts_rate_limit_store = new Map<string, RateLimitEntry>();
  }
  return g.__cts_rate_limit_store as Map<string, RateLimitEntry>;
}

export async function checkRateLimit(
  req: Request,
  cfg: RateLimitConfig
): Promise<{ allowed: true } | { allowed: false; retryAfterSeconds: number }> {
  const ip = getClientIp(req);
  const key = `${cfg.keyPrefix}:${ip}`;

  const t = nowUnix();
  const windowSeconds = Math.max(1, cfg.windowSeconds);

  if (safeHasDatabase()) {
    try {
      await ensureSchema();
      const windowStartUnix = Math.floor(t / windowSeconds) * windowSeconds;
      const resetAtUnix = windowStartUnix + windowSeconds;

      const pool = getPool();
      const { rows } = await pool.query(
        "insert into public.rate_limits (key, window_start_unix, count, reset_at_unix, updated_at_unix) values ($1, $2, 1, $3, $4) on conflict (key, window_start_unix) do update set count = public.rate_limits.count + 1, updated_at_unix = excluded.updated_at_unix returning count, reset_at_unix",
        [key, windowStartUnix, resetAtUnix, t]
      );

      const count = Number(rows?.[0]?.count ?? 0);
      const reset = Number(rows?.[0]?.reset_at_unix ?? resetAtUnix);

      if (count > cfg.limit) {
        return { allowed: false, retryAfterSeconds: Math.max(1, reset - t) };
      }

      return { allowed: true };
    } catch (e) {
      console.error("Rate limit DB error", e);
    }
  }

  const store = getStore();

  const existing = store.get(key);
  if (!existing || existing.resetAtUnix <= t) {
    store.set(key, { count: 1, resetAtUnix: t + windowSeconds });
    return { allowed: true };
  }

  if (existing.count >= cfg.limit) {
    return { allowed: false, retryAfterSeconds: Math.max(1, existing.resetAtUnix - t) };
  }

  store.set(key, { ...existing, count: existing.count + 1 });
  return { allowed: true };
}

type RateLimitConfig = {
  keyPrefix: string;
  limit: number;
  windowSeconds: number;
};

type RateLimitEntry = {
  count: number;
  resetAtUnix: number;
};

function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
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

export function checkRateLimit(
  req: Request,
  cfg: RateLimitConfig
): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  const ip = getClientIp(req);
  const key = `${cfg.keyPrefix}:${ip}`;

  const t = nowUnix();
  const store = getStore();

  const existing = store.get(key);
  if (!existing || existing.resetAtUnix <= t) {
    store.set(key, { count: 1, resetAtUnix: t + Math.max(1, cfg.windowSeconds) });
    return { allowed: true };
  }

  if (existing.count >= cfg.limit) {
    return { allowed: false, retryAfterSeconds: Math.max(1, existing.resetAtUnix - t) };
  }

  store.set(key, { ...existing, count: existing.count + 1 });
  return { allowed: true };
}

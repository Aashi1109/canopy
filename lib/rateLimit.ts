type RateLimitEntry = {
  count: number;
  resetAt: number;
};

export type RateLimitResult =
  | { allowed: true; remaining: number; resetAt: number }
  | { allowed: false; retryAfterSeconds: number; resetAt: number };

const DEFAULT_LIMIT = 20;
const DEFAULT_WINDOW_MS = 60_000;

/** Caps spoofed client keys to a small, predictable amount of process memory. */
export const RATE_LIMIT_MAX_ENTRIES: number = 1_000;

const entries = new Map<string, RateLimitEntry>();

function positiveInteger(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function currentTime(): number {
  try {
    const now = Date.now();
    return Number.isFinite(now) && now >= 0 ? now : 0;
  } catch {
    return 0;
  }
}

function evictExpired(now: number): void {
  for (const [key, entry] of entries) {
    if (entry.resetAt <= now) entries.delete(key);
  }
}

/**
 * A fixed window is sufficient here: 20 requests/minute permits interactive
 * use while putting a firm speed bump in front of the paid Ahrefs upstream.
 * Expired entries are removed on every write; at the cap, Map insertion order
 * evicts the oldest remaining entry before a new client is recorded.
 */
// ponytail: per-instance state resets on restart; use a shared store for multi-instance standalone deploys.
export function checkRateLimit(
  key: string,
  options?: { limit?: number; windowMs?: number; now?: number },
): RateLimitResult {
  try {
    const limit = positiveInteger(options?.limit, DEFAULT_LIMIT);
    const windowMs = positiveInteger(options?.windowMs, DEFAULT_WINDOW_MS);
    const injectedNow = options?.now;
    const now =
      typeof injectedNow === "number" && Number.isFinite(injectedNow) && injectedNow >= 0 ? injectedNow : currentTime();

    evictExpired(now);

    const existing = entries.get(key);
    if (existing) {
      if (existing.count >= limit) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1_000)),
          resetAt: existing.resetAt,
        };
      }

      const count = existing.count + 1;
      entries.set(key, { count, resetAt: existing.resetAt });
      return { allowed: true, remaining: limit - count, resetAt: existing.resetAt };
    }

    if (entries.size >= RATE_LIMIT_MAX_ENTRIES) {
      const oldestKey = entries.keys().next().value;
      if (typeof oldestKey === "string") entries.delete(oldestKey);
    }

    const resetAt = now + windowMs;
    entries.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt };
  } catch {
    const now = currentTime();
    return {
      allowed: false,
      retryAfterSeconds: DEFAULT_WINDOW_MS / 1_000,
      resetAt: now + DEFAULT_WINDOW_MS,
    };
  }
}

/** Exposes only the bounded size for regression tests. */
export function getRateLimitStoreSize(): number {
  return entries.size;
}

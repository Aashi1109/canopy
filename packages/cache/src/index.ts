import axios from "axios";

async function command(args: string[]): Promise<unknown> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { data } = await axios.post<unknown>(url, args, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    timeout: 1_000,
    maxRedirects: 0,
    signal: AbortSignal.timeout(1_000),
  });
  if (!data || typeof data !== "object" || !("result" in data) || "error" in data) {
    throw new Error("Invalid cache response");
  }
  return data.result;
}

export class Cache {
  private readonly namespace: string;

  constructor(namespace: string) {
    if (typeof namespace !== "string" || !namespace.trim()) {
      throw new Error("Cache namespace must not be empty.");
    }
    this.namespace = namespace;
  }

  private key(key: string): string {
    if (typeof key !== "string" || !key.trim()) {
      throw new Error("Cache key must not be empty.");
    }
    return `${this.namespace}:${key}`;
  }

  async get(key: string): Promise<unknown> {
    const redisKey = this.key(key);
    try {
      const value = await command(["GET", redisKey]);
      if (value === null) return null;
      if (typeof value !== "string") throw new Error("Invalid cached value");
      return JSON.parse(value);
    } catch {
      console.warn("Cache read unavailable or invalid; treating as a miss.");
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds = 300): Promise<void> {
    const redisKey = this.key(key);
    if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds <= 0) {
      throw new Error("Cache TTL must be a positive integer.");
    }
    try {
      const serialized = JSON.stringify(value);
      if (serialized === undefined) throw new Error("Cache value must be JSON serializable");
      await command(["SET", redisKey, serialized, "EX", String(ttlSeconds)]);
    } catch {
      console.warn("Cache write unavailable; continuing without caching.");
    }
  }

  async delete(key: string): Promise<void> {
    const redisKey = this.key(key);
    try {
      await command(["DEL", redisKey]);
    } catch {
      console.warn("Cache deletion unavailable; cached data will expire.");
    }
  }

  async remember<T>(key: string, load: () => Promise<T>, ttlSeconds = 300): Promise<T> {
    const cached = await this.get(key);
    if (cached !== null) return cached as T;
    const value = await load();
    // ponytail: a late load can refill after deletion; add generation checks if this becomes unacceptable.
    await this.set(key, value, ttlSeconds);
    return value;
  }
}

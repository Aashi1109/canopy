import redis from "redis";
import { metric } from "@vercel/functions";

export { CACHE_NAMESPACES } from "./constants.ts";

// One key holds both the value and mutation fences, so expiry cannot resurrect an old load.
const GUARDED_READ = `
local value = redis.call('GET', KEYS[1])
if value then return value end
value = cjson.encode({generation=ARGV[1], pending={}})
redis.call('SET', KEYS[1], value, 'EX', ARGV[2])
return value`;

const GUARDED_FILL = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 0 end
local entry = cjson.decode(raw)
if entry.generation ~= ARGV[1] or next(entry.pending) then return 0 end
entry.value = ARGV[2]
redis.call('SET', KEYS[1], cjson.encode(entry), 'EX', ARGV[3])
return 1`;

const INVALIDATION_BEGIN = `
local raw = redis.call('GET', KEYS[1])
local entry = raw and cjson.decode(raw) or {pending={}}
entry.generation = ARGV[1]
entry.value = nil
entry.pending[ARGV[1]] = true
redis.call('SET', KEYS[1], cjson.encode(entry))
return 1`;

const INVALIDATION_END = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 0 end
local entry = cjson.decode(raw)
if not entry.pending[ARGV[1]] then return 0 end
entry.pending[ARGV[1]] = nil
entry.generation = ARGV[2]
entry.value = nil
if next(entry.pending) then
  redis.call('SET', KEYS[1], cjson.encode(entry))
else
  redis.call('SET', KEYS[1], cjson.encode(entry), 'EX', ARGV[3])
end
return 1`;

function validateTtl(ttlSeconds: number): void {
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds <= 0) {
    throw new Error("Cache TTL must be a positive integer.");
  }
}

function connectRedis() {
  const client = redis.createClient({
    url: process.env.REDIS_URL?.trim(),
    socket: {
      connectTimeout: 1_000,
      reconnectStrategy: false,
    },
    disableOfflineQueue: true,
  });
  client.on("error", () => console.warn("Redis connection unavailable."));
  return { client, ready: client.connect() };
}

let connection: ReturnType<typeof connectRedis> | undefined;

export function closeRedis(): void {
  if (connection?.client.isOpen) connection.client.destroy();
  connection = undefined;
}

async function command(args: string[]): Promise<unknown> {
  if (!process.env.REDIS_URL?.trim()) return null;
  const started = performance.now();
  let status = "success";
  // Workers cannot reuse sockets across requests. Keep their commands self-contained.
  // ponytail: one connection per Worker command; add request-scoped reuse if latency warrants it.
  const transient = globalThis.navigator?.userAgent === "Cloudflare-Workers";
  let current: ReturnType<typeof connectRedis> | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    current = transient ? connectRedis() : connection?.client.isOpen ? connection : (connection = connectRedis());
    const { client, ready } = current;
    return await Promise.race([
      ready.then(() => client.sendCommand(args)),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error("Redis command timed out"));
          if (client.isOpen) client.destroy();
        }, 1_000);
      }),
    ]);
  } catch {
    status = "error";
    // Do not expose connection credentials through errors from the Redis client.
    throw new Error("Redis cache unavailable");
  } finally {
    clearTimeout(timeout);
    if (transient && current?.client.isOpen) current.client.destroy();
    try {
      metric("redis.command.duration_ms", performance.now() - started, { command: args[0], status });
    } catch {
      // Observability must not change cache behavior.
    }
  }
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

  async rememberGuarded<T>(key: string, load: () => Promise<T>, ttlSeconds = 300): Promise<T> {
    const redisKey = this.key(key);
    validateTtl(ttlSeconds);
    let generation: string | undefined;
    try {
      const raw = await command(["EVAL", GUARDED_READ, "1", redisKey, crypto.randomUUID(), String(ttlSeconds)]);
      if (typeof raw === "string") {
        const entry: unknown = JSON.parse(raw);
        if (
          !entry ||
          typeof entry !== "object" ||
          !("generation" in entry) ||
          typeof entry.generation !== "string" ||
          !("pending" in entry) ||
          !entry.pending ||
          typeof entry.pending !== "object"
        ) {
          throw new Error("Invalid guarded cache value");
        }
        if (Object.keys(entry.pending).length === 0) {
          if ("value" in entry) {
            if (typeof entry.value !== "string") throw new Error("Invalid guarded cache payload");
            return JSON.parse(entry.value) as T;
          }
          generation = entry.generation;
        }
      }
    } catch {
      console.warn("Cache read unavailable or invalid; treating as a miss.");
    }
    const value = await load();
    if (generation !== undefined) {
      try {
        const serialized = JSON.stringify(value);
        if (serialized === undefined) throw new Error("Cache value must be JSON serializable");
        await command(["EVAL", GUARDED_FILL, "1", redisKey, generation, serialized, String(ttlSeconds)]);
      } catch {
        console.warn("Cache write unavailable; continuing without caching.");
      }
    }
    return value;
  }

  async beginInvalidation(key: string, ttlSeconds = 300): Promise<string | null> {
    const redisKey = this.key(key);
    validateTtl(ttlSeconds);
    if (!process.env.REDIS_URL?.trim()) return null;
    const token = crypto.randomUUID();
    const result = await command(["EVAL", INVALIDATION_BEGIN, "1", redisKey, token]);
    if (result !== 1) throw new Error("Cache invalidation failed");
    return token;
  }

  async endInvalidation(key: string, token: string | null, ttlSeconds = 300): Promise<void> {
    const redisKey = this.key(key);
    validateTtl(ttlSeconds);
    if (token === null) return;
    // A failed release leaves caching disabled for this key instead of serving stale access.
    try {
      const result = await command([
        "EVAL",
        INVALIDATION_END,
        "1",
        redisKey,
        token,
        crypto.randomUUID(),
        String(ttlSeconds),
      ]);
      if (result !== 1) throw new Error("Cache invalidation release failed");
    } catch {
      console.warn("Cache invalidation release unavailable; caching remains disabled for this key.");
    }
  }
}

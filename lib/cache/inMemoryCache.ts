type CacheEntry<V> = {
  value: V;
  expiresAt: number | null;
};

/**
 * Instance-local cache. Values are stored by reference and are not shared
 * across processes or persisted across restarts. TTLs use whole seconds,
 * matching the Redis cache; omitting a TTL keeps an entry until removed.
 *
 * Expiration is lazy: reads remove expired entries for their key, while
 * writes and size checks sweep all expired entries. There are no timers
 * or capacity limits, so callers must bound non-expiring key sets.
 */
export class InMemoryCache<K, V> {
  private readonly entries = new Map<K, CacheEntry<V>>();
  private readonly pending = new Map<K, Promise<V>>();

  /** Number of entries that have not expired. */
  get size(): number {
    this.pruneExpired(Date.now());
    return this.entries.size;
  }

  /** Returns undefined on a miss; use has() to distinguish a cached undefined. */
  get(key: K): V | undefined {
    return this.getEntry(key)?.value;
  }

  has(key: K): boolean {
    return this.getEntry(key) !== undefined;
  }

  /** Replaces the value and its expiration. Reads do not extend the TTL. */
  set(key: K, value: V, ttlSeconds?: number): this {
    this.validateTtl(ttlSeconds);
    const now = Date.now();
    this.pruneExpired(now);
    this.pending.delete(key);
    this.entries.set(key, {
      value,
      expiresAt: ttlSeconds === undefined ? null : now + ttlSeconds * 1_000,
    });
    return this;
  }

  /**
   * Shares in-flight loads; successful values start their TTL when loaded.
   * Invalidation detaches pending loads; their existing callers still receive the result.
   */
  remember(key: K, load: () => Promise<V>, ttlSeconds?: number): Promise<V> {
    this.validateTtl(ttlSeconds);
    const entry = this.getEntry(key);
    if (entry) return Promise.resolve(entry.value);
    const existing = this.pending.get(key);
    if (existing) return existing;

    const pending = Promise.resolve()
      .then(load)
      .then((value) => {
        if (this.pending.get(key) === pending) this.set(key, value, ttlSeconds);
        return value;
      })
      .finally(() => {
        if (this.pending.get(key) === pending) this.pending.delete(key);
      });
    this.pending.set(key, pending);
    return pending;
  }

  /** Returns true only when a live entry was removed. */
  delete(key: K): boolean {
    this.pending.delete(key);
    return this.has(key) && this.entries.delete(key);
  }

  clear(): void {
    this.pending.clear();
    this.entries.clear();
  }

  private validateTtl(ttlSeconds?: number): void {
    if (ttlSeconds !== undefined && (!Number.isSafeInteger(ttlSeconds) || ttlSeconds <= 0)) {
      throw new RangeError("Cache TTL must be a positive integer.");
    }
  }

  private getEntry(key: K): CacheEntry<V> | undefined {
    const entry = this.entries.get(key);
    if (entry && entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry;
  }

  private pruneExpired(now: number): void {
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt !== null && entry.expiresAt <= now) {
        this.entries.delete(key);
      }
    }
  }
}

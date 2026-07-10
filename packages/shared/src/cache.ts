import type { Redis } from "ioredis";
import { LRUCache } from "lru-cache";

/**
 * Cache-aside layer in front of upstream calls (primarily Birdeye). Redis is
 * the source of truth across processes; a small in-memory LRU shields Redis
 * itself from redundant round-trips within a single process during a burst.
 */
export class Cache {
  private readonly local: LRUCache<string, string>;

  constructor(
    private readonly redis: Redis,
    localMax = 5000,
  ) {
    this.local = new LRUCache({ max: localMax });
  }

  async getOrSet<T>(key: string, ttlMs: number, fetch: () => Promise<T>): Promise<T> {
    const local = this.local.get(key);
    if (local !== undefined) return JSON.parse(local) as T;

    const cached = await this.redis.get(key);
    if (cached !== null) {
      this.local.set(key, cached, { ttl: ttlMs });
      return JSON.parse(cached) as T;
    }

    const value = await fetch();
    const serialized = JSON.stringify(value);
    await this.redis.set(key, serialized, "PX", ttlMs);
    this.local.set(key, serialized, { ttl: ttlMs });
    return value;
  }
}

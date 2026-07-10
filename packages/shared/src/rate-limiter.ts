import type { Redis } from "ioredis";

/**
 * Distributed token-bucket rate limiter backed by Redis, so every process
 * hitting Birdeye (ingest workers, API, backtest jobs) shares one budget
 * instead of each independently assuming the full RPS. This is what stands
 * between public traffic and Birdeye's 15 RPS Lite-plan ceiling.
 */
export class RateLimiter {
  constructor(
    private readonly redis: Redis,
    private readonly key: string,
    private readonly maxPerWindow: number,
    private readonly windowMs: number,
  ) {}

  /** Resolves once a slot is free; blocks (with backoff) if the budget is exhausted. */
  async acquire(): Promise<void> {
    for (;;) {
      const bucketKey = `${this.key}:${Math.floor(Date.now() / this.windowMs)}`;
      const count = await this.redis.incr(bucketKey);
      if (count === 1) {
        await this.redis.pexpire(bucketKey, this.windowMs);
      }
      if (count <= this.maxPerWindow) return;

      const ttl = await this.redis.pttl(bucketKey);
      await sleep(Math.max(ttl, 10));
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

import type { Redis } from "ioredis";
import { Cache } from "./cache.js";
import { RateLimiter } from "./rate-limiter.js";

const BIRDEYE_BASE_URL = "https://public-api.birdeye.so";
const DEFAULT_CACHE_TTL_MS = 10_000; // matches the API's "all responses cached 10s minimum" rule

export interface TokenPriceLiquidity {
  mint: string;
  priceUsd: number | null;
  liquidityUsd: number | null;
  /** true if Birdeye returned no data or a stale timestamp — callers must degrade to UNKNOWN, not CRITICAL */
  stale: boolean;
  fetchedAt: number;
}

/**
 * All Birdeye reads across the whole system go through this client, never
 * direct fetches. It rate-limits against the shared 15 RPS Lite-plan budget
 * and caches so public/API traffic never reaches Birdeye directly.
 */
export class BirdeyeClient {
  private readonly limiter: RateLimiter;
  private readonly cache: Cache;

  constructor(
    private readonly apiKey: string,
    redis: Redis,
    rateLimitRps = 15,
  ) {
    this.limiter = new RateLimiter(redis, "ratelimit:birdeye", rateLimitRps, 1000);
    this.cache = new Cache(redis);
  }

  async getPriceLiquidity(mint: string): Promise<TokenPriceLiquidity> {
    return this.cache.getOrSet(`birdeye:price:${mint}`, DEFAULT_CACHE_TTL_MS, async () => {
      await this.limiter.acquire();

      try {
        const res = await fetch(`${BIRDEYE_BASE_URL}/defi/price?address=${mint}`, {
          headers: { "X-API-KEY": this.apiKey, "x-chain": "solana" },
        });

        if (!res.ok) {
          return { mint, priceUsd: null, liquidityUsd: null, stale: true, fetchedAt: Date.now() };
        }

        const body = (await res.json()) as {
          data?: { value?: number; liquidity?: number; updateUnixTime?: number };
        };

        const updatedAt = (body.data?.updateUnixTime ?? 0) * 1000;
        const isStale = updatedAt === 0 || Date.now() - updatedAt > 5 * 60_000;

        return {
          mint,
          priceUsd: body.data?.value ?? null,
          liquidityUsd: body.data?.liquidity ?? null,
          stale: isStale,
          fetchedAt: Date.now(),
        };
      } catch {
        // Network/upstream failure degrades to stale/UNKNOWN, never thrown as CRITICAL.
        return { mint, priceUsd: null, liquidityUsd: null, stale: true, fetchedAt: Date.now() };
      }
    });
  }
}

import type { Redis } from "ioredis";
import { PublicKey } from "@solana/web3.js";
import { Cache } from "./cache.js";
import { RateLimiter } from "./rate-limiter.js";

const BIRDEYE_BASE_URL = "https://public-api.birdeye.so";
const DEFAULT_CACHE_TTL_MS = 10_000; // matches the API's "all responses cached 10s minimum" rule
const WSOL_MINT = "So11111111111111111111111111111111111111112";

export interface TokenOverview {
  priceUsd: number;
  liquidityUsd: number;
  mcUsd: number;
  volume5mUsd: number;
  volume15mUsd: number;
  priceChange5mPct: number;
  priceChange15mPct: number;
  holderCount: number;
  /** true if Birdeye returned no data — callers must degrade to UNKNOWN, not CRITICAL */
  stale: boolean;
  fetchedAt: number;
}

/** Legacy narrow shape kept for callers that only need price/liquidity (e.g. tier/paywall checks). */
export interface TokenPriceLiquidity {
  mint: string;
  priceUsd: number | null;
  liquidityUsd: number | null;
  stale: boolean;
  fetchedAt: number;
}

/**
 * All Birdeye reads across the whole system go through this client, never
 * direct fetches. It rate-limits against the shared 15 RPS Lite-plan budget
 * and caches so public/API traffic never reaches Birdeye directly.
 *
 * Ported from the source bot's `dataProviders.ts` BirdeyeClient — same
 * endpoints and field mapping, adapted to our shared rate-limiter/cache
 * instead of bespoke axios retry.
 */
export class BirdeyeClient {
  private readonly limiter: RateLimiter;
  private readonly cache: Cache;

  constructor(
    private readonly apiKey: string,
    redis: Redis,
    rateLimitRps = 15,
    /** on-chain total supply lookup, used to turn Birdeye's raw holder amounts into percentages */
    private readonly getTokenSupplyUi?: (mint: string) => Promise<number>,
  ) {
    this.limiter = new RateLimiter(redis, "ratelimit:birdeye", rateLimitRps, 1000);
    this.cache = new Cache(redis);
  }

  private async get(path: string, params: Record<string, string | number>): Promise<any> {
    await this.limiter.acquire();
    const url = new URL(`${BIRDEYE_BASE_URL}${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

    const res = await fetch(url, { headers: { "X-API-KEY": this.apiKey, "x-chain": "solana" } });
    if (!res.ok) throw new Error(`Birdeye ${path} ${res.status}`);
    return res.json();
  }

  async tokenOverview(mint: string): Promise<TokenOverview> {
    return this.cache.getOrSet(`birdeye:overview:${mint}`, DEFAULT_CACHE_TTL_MS, async () => {
      try {
        const body = await this.get("/defi/token_overview", { address: mint });
        const d = body?.data;
        if (!d) {
          return {
            priceUsd: 0,
            liquidityUsd: 0,
            mcUsd: 0,
            volume5mUsd: 0,
            volume15mUsd: 0,
            priceChange5mPct: 0,
            priceChange15mPct: 0,
            holderCount: 0,
            stale: true,
            fetchedAt: Date.now(),
          };
        }
        return {
          priceUsd: d.price ?? 0,
          liquidityUsd: d.liquidity ?? 0,
          mcUsd: d.mc ?? d.marketCap ?? 0,
          volume5mUsd: d.v5mUSD ?? d.vol5mUSD ?? 0,
          volume15mUsd: d.v15mUSD ?? d.vol15mUSD ?? 0,
          priceChange5mPct: d.priceChange5mPercent ?? 0,
          priceChange15mPct: d.priceChange15mPercent ?? 0,
          holderCount: d.holder ?? 0,
          stale: false,
          fetchedAt: Date.now(),
        };
      } catch {
        // Network/upstream failure degrades to stale/UNKNOWN, never thrown as CRITICAL.
        return {
          priceUsd: 0,
          liquidityUsd: 0,
          mcUsd: 0,
          volume5mUsd: 0,
          volume15mUsd: 0,
          priceChange5mPct: 0,
          priceChange15mPct: 0,
          holderCount: 0,
          stale: true,
          fetchedAt: Date.now(),
        };
      }
    });
  }

  /**
   * Top holders as % of supply, sorted desc. Birdeye's v3 holder endpoint
   * returns raw amounts (no percentage field), so percentages are computed
   * against on-chain total supply. Program-owned vaults (AMM pools, bonding
   * curves — PDA owners, never on the ed25519 curve) are excluded so a
   * liquidity pool doesn't get counted as a "holder".
   */
  async topHolderPcts(mint: string, n = 10): Promise<number[]> {
    return this.cache.getOrSet(`birdeye:holders:${mint}:${n}`, DEFAULT_CACHE_TTL_MS, async () => {
      try {
        const body = await this.get("/defi/v3/token/holder", { address: mint, offset: 0, limit: n });
        const items: Array<{ ui_amount?: number; uiAmount?: number; owner?: string }> = body?.data?.items ?? [];

        const amounts = items
          .filter((i) => {
            if (!i.owner) return true;
            try {
              return PublicKey.isOnCurve(new PublicKey(i.owner).toBytes());
            } catch {
              return true;
            }
          })
          .map((i) => Number(i.ui_amount ?? i.uiAmount ?? 0))
          .filter((a) => a > 0);
        if (amounts.length === 0) return [];

        const total = this.getTokenSupplyUi ? await this.getTokenSupplyUi(mint) : 0;
        if (total <= 0) return [];

        return amounts.map((a) => (a / total) * 100).sort((a, b) => b - a);
      } catch {
        return [];
      }
    });
  }

  async solPriceUsd(): Promise<number> {
    return this.cache.getOrSet("birdeye:sol-price", DEFAULT_CACHE_TTL_MS, async () => {
      try {
        const body = await this.get("/defi/price", { address: WSOL_MINT });
        return body?.data?.value ?? 0;
      } catch {
        return 0;
      }
    });
  }

  /** Narrow price/liquidity view for callers that don't need the full overview (kept for compatibility). */
  async getPriceLiquidity(mint: string): Promise<TokenPriceLiquidity> {
    const overview = await this.tokenOverview(mint);
    return {
      mint,
      priceUsd: overview.stale ? null : overview.priceUsd,
      liquidityUsd: overview.stale ? null : overview.liquidityUsd,
      stale: overview.stale,
      fetchedAt: overview.fetchedAt,
    };
  }
}

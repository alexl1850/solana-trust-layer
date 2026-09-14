import type { Redis } from "ioredis";
import { Cache } from "./cache.js";
import { RateLimiter } from "./rate-limiter.js";

const DEXSCREENER_BASE_URL = "https://api.dexscreener.com";
const DEFAULT_CACHE_TTL_MS = 15_000;

/** Matches DexScreener's `chainId` values 1:1 with our internal Chain type — no translation needed. */
export type DexScreenerChainId = "solana" | "ethereum" | "base" | "bsc";

export interface DexPair {
  chainId: string;
  dexId: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; name: string; symbol: string };
  priceUsd: number;
  liquidityUsd: number;
  fdvUsd: number;
  marketCapUsd: number;
  volume5mUsd: number;
  volume1hUsd: number;
  priceChange5mPct: number;
  priceChange1hPct: number;
  buys5m: number;
  sells5m: number;
  /** epoch ms, null if DexScreener hasn't indexed pair creation time */
  pairCreatedAt: number | null;
  /** true if this is a graceful degrade (upstream failure/missing data) — fields are zeroed, never fabricated */
  stale: boolean;
}

function toPair(raw: Record<string, any>): DexPair {
  return {
    chainId: raw?.chainId ?? "",
    dexId: raw?.dexId ?? "",
    pairAddress: raw?.pairAddress ?? "",
    baseToken: {
      address: raw?.baseToken?.address ?? "",
      name: raw?.baseToken?.name ?? "",
      symbol: raw?.baseToken?.symbol ?? "",
    },
    quoteToken: {
      address: raw?.quoteToken?.address ?? "",
      name: raw?.quoteToken?.name ?? "",
      symbol: raw?.quoteToken?.symbol ?? "",
    },
    priceUsd: Number(raw?.priceUsd ?? 0),
    liquidityUsd: Number(raw?.liquidity?.usd ?? 0),
    fdvUsd: Number(raw?.fdv ?? 0),
    marketCapUsd: Number(raw?.marketCap ?? raw?.fdv ?? 0),
    volume5mUsd: Number(raw?.volume?.m5 ?? 0),
    volume1hUsd: Number(raw?.volume?.h1 ?? 0),
    priceChange5mPct: Number(raw?.priceChange?.m5 ?? 0),
    priceChange1hPct: Number(raw?.priceChange?.h1 ?? 0),
    buys5m: Number(raw?.txns?.m5?.buys ?? 0),
    sells5m: Number(raw?.txns?.m5?.sells ?? 0),
    pairCreatedAt: typeof raw?.pairCreatedAt === "number" ? raw.pairCreatedAt : null,
    stale: false,
  };
}

function stalePair(chainId: string, pairAddress: string): DexPair {
  return {
    chainId,
    dexId: "",
    pairAddress,
    baseToken: { address: "", name: "", symbol: "" },
    quoteToken: { address: "", name: "", symbol: "" },
    priceUsd: 0,
    liquidityUsd: 0,
    fdvUsd: 0,
    marketCapUsd: 0,
    volume5mUsd: 0,
    volume1hUsd: 0,
    priceChange5mPct: 0,
    priceChange1hPct: 0,
    buys5m: 0,
    sells5m: 0,
    pairCreatedAt: null,
    stale: true,
  };
}

/**
 * Multi-chain DEX pair data (Ethereum/Base/BSC/Solana), used only for the
 * early-volume/pre-FOMO alert feature — a free, unauthenticated public API,
 * so no API key config. Same rate-limited + cached shape as BirdeyeClient:
 * every read goes through here so ingest workers and API instances share
 * one budget instead of each assuming the full published limit.
 *
 * Degrades to a stale/zeroed result on any upstream failure — never throws
 * out of a public read path (same hard rule BirdeyeClient follows: stale
 * data must degrade gracefully, not get mistaken for a real zero/negative
 * signal).
 */
export class DexScreenerClient {
  private readonly limiter: RateLimiter;
  private readonly cache: Cache;

  constructor(redis: Redis, rateLimitRps = 5) {
    this.limiter = new RateLimiter(redis, "ratelimit:dexscreener", rateLimitRps, 1000);
    this.cache = new Cache(redis);
  }

  private async get(path: string): Promise<any> {
    await this.limiter.acquire();
    const res = await fetch(`${DEXSCREENER_BASE_URL}${path}`);
    if (!res.ok) throw new Error(`DexScreener ${path} ${res.status}`);
    return res.json();
  }

  private static extractPairs(body: any): any[] {
    if (Array.isArray(body)) return body;
    if (Array.isArray(body?.pairs)) return body.pairs;
    return [];
  }

  /** All pairs a token trades on across every DEX/pool, on one chain. */
  async getTokenPairs(chainId: DexScreenerChainId, tokenAddress: string): Promise<DexPair[]> {
    return this.cache.getOrSet(`dexscreener:token-pairs:${chainId}:${tokenAddress}`, DEFAULT_CACHE_TTL_MS, async () => {
      try {
        const body = await this.get(`/token-pairs/v1/${encodeURIComponent(chainId)}/${encodeURIComponent(tokenAddress)}`);
        return DexScreenerClient.extractPairs(body).map(toPair);
      } catch {
        return [];
      }
    });
  }

  /** A single known pair by address — the hot path once a pair has already been discovered. */
  async getPair(chainId: DexScreenerChainId, pairAddress: string): Promise<DexPair> {
    return this.cache.getOrSet(`dexscreener:pair:${chainId}:${pairAddress}`, DEFAULT_CACHE_TTL_MS, async () => {
      try {
        const body = await this.get(`/latest/dex/pairs/${encodeURIComponent(chainId)}/${encodeURIComponent(pairAddress)}`);
        const pairs = DexScreenerClient.extractPairs(body);
        if (pairs.length === 0) return stalePair(chainId, pairAddress);
        return toPair(pairs[0]);
      } catch {
        return stalePair(chainId, pairAddress);
      }
    });
  }

  /** Free-text search (symbol/name/address) — used for discovery on chains with no live pair-creation feed configured. */
  async search(query: string): Promise<DexPair[]> {
    return this.cache.getOrSet(`dexscreener:search:${query}`, DEFAULT_CACHE_TTL_MS, async () => {
      try {
        const body = await this.get(`/latest/dex/search?q=${encodeURIComponent(query)}`);
        return DexScreenerClient.extractPairs(body).map(toPair);
      } catch {
        return [];
      }
    });
  }
}

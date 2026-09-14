import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Redis } from "ioredis";
import { DexScreenerClient } from "../dexscreener-client.js";

/** Minimal in-memory stand-in for the four Redis methods RateLimiter/Cache actually call. */
function fakeRedis(): Redis {
  const store = new Map<string, string>();
  const counters = new Map<string, number>();
  return {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async set(key: string, value: string) {
      store.set(key, value);
      return "OK";
    },
    async incr(key: string) {
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      return next;
    },
    async pexpire() {
      return 1;
    },
    async pttl() {
      return 0;
    },
  } as unknown as Redis;
}

const SAMPLE_PAIR = {
  chainId: "ethereum",
  dexId: "uniswap",
  pairAddress: "0xpair",
  baseToken: { address: "0xtoken", name: "Test Token", symbol: "TEST" },
  quoteToken: { address: "0xweth", name: "Wrapped Ether", symbol: "WETH" },
  priceUsd: "0.001234",
  liquidity: { usd: 42_000 },
  fdv: 500_000,
  marketCap: 480_000,
  volume: { m5: 8_000, h1: 12_000 },
  priceChange: { m5: 22.5, h1: 40 },
  txns: { m5: { buys: 30, sells: 5 } },
  pairCreatedAt: 1_700_000_000_000,
};

describe("DexScreenerClient", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ pairs: [SAMPLE_PAIR] }) })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalizes a pair response into the DexPair shape", async () => {
    const client = new DexScreenerClient(fakeRedis(), 100);
    const pair = await client.getPair("ethereum", "0xpair");

    expect(pair.stale).toBe(false);
    expect(pair.pairAddress).toBe("0xpair");
    expect(pair.baseToken.symbol).toBe("TEST");
    expect(pair.priceUsd).toBeCloseTo(0.001234, 6);
    expect(pair.liquidityUsd).toBe(42_000);
    expect(pair.volume5mUsd).toBe(8_000);
    expect(pair.volume1hUsd).toBe(12_000);
    expect(pair.priceChange5mPct).toBe(22.5);
    expect(pair.buys5m).toBe(30);
    expect(pair.sells5m).toBe(5);
    expect(pair.pairCreatedAt).toBe(1_700_000_000_000);
  });

  it("degrades to a stale zeroed pair when no data is returned", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ pairs: [] }) })));
    const client = new DexScreenerClient(fakeRedis(), 100);
    const pair = await client.getPair("ethereum", "0xmissing");

    expect(pair.stale).toBe(true);
    expect(pair.liquidityUsd).toBe(0);
    expect(pair.pairCreatedAt).toBeNull();
  });

  it("degrades to a stale zeroed pair on upstream HTTP failure, never throwing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })));
    const client = new DexScreenerClient(fakeRedis(), 100);
    const pair = await client.getPair("ethereum", "0xdown");

    expect(pair.stale).toBe(true);
  });

  it("returns an empty array (not a throw) when search finds nothing usable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })));
    const client = new DexScreenerClient(fakeRedis(), 100);
    const results = await client.search("nonexistent");

    expect(results).toEqual([]);
  });
});

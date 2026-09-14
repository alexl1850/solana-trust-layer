import { describe, expect, it } from "vitest";
import type { DexPair } from "@solana-trust-layer/shared";
import { FomoPipeline } from "../fomo-pipeline.js";

const DEFAULT_PAIR: DexPair = {
  chainId: "ethereum",
  dexId: "uniswap",
  pairAddress: "0xpair",
  baseToken: { address: "0xtoken", name: "Test Token", symbol: "TEST" },
  quoteToken: { address: "0xweth", name: "Wrapped Ether", symbol: "WETH" },
  priceUsd: 0.001,
  liquidityUsd: 50_000,
  fdvUsd: 300_000,
  marketCapUsd: 300_000,
  volume5mUsd: 5_000,
  volume1hUsd: 12_000,
  priceChange5mPct: 20,
  priceChange1hPct: 20,
  buys5m: 20,
  sells5m: 2,
  pairCreatedAt: Date.now() - 5 * 60_000,
  stale: false,
};

function fakeDexscreener(overrides: Partial<DexPair> = {}) {
  return {
    getPair: async () => ({ ...DEFAULT_PAIR, ...overrides }),
    getTokenPairs: async () => [{ ...DEFAULT_PAIR, ...overrides }],
  };
}

function fakeDb(scoreEventRow: { score: number | null; risk_level: string } | null = null) {
  const inserted: Array<Record<string, unknown>> = [];
  const db = {
    from(table: string) {
      if (table === "fomo_events") {
        return {
          insert: async (payload: Record<string, unknown>) => {
            inserted.push(payload);
            return { error: null };
          },
        };
      }
      if (table === "score_events") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  single: async () => ({
                    data: scoreEventRow,
                    error: scoreEventRow ? null : { message: "not found" },
                  }),
                }),
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return { db: db as any, inserted };
}

describe("FomoPipeline.evaluatePair", () => {
  it("degrades to UNKNOWN (null score, null rug_risk_level) on stale upstream data", async () => {
    const { db, inserted } = fakeDb();
    const pipeline = new FomoPipeline(db, fakeDexscreener({ stale: true }));

    const score = await pipeline.evaluatePair("ethereum", "0xpair");

    expect(score).toBeNull();
    expect(inserted[0]?.fomo_score).toBeNull();
    expect(inserted[0]?.rug_risk_level).toBeNull();
  });

  it("scores a healthy EVM pair without consulting score_events (non-Solana)", async () => {
    const { db, inserted } = fakeDb();
    const pipeline = new FomoPipeline(db, fakeDexscreener());

    const score = await pipeline.evaluatePair("ethereum", "0xpair");

    expect(score).toBeGreaterThan(0);
    expect(inserted[0]?.rug_risk_level).not.toBe("critical");
    const signals = inserted[0]?.signals as { rugRisk: { solanaTrained: unknown } };
    expect(signals.rugRisk.solanaTrained).toBeNull();
  });

  it("flags panic_dump divergence as high rug risk and suppresses the score", async () => {
    const { db, inserted } = fakeDb();
    const pipeline = new FomoPipeline(db, fakeDexscreener({ priceChange5mPct: -25, volume5mUsd: 30_000 }));

    await pipeline.evaluatePair("ethereum", "0xpair");

    expect(inserted[0]?.rug_risk_level).toBe("high");
  });

  it("treats a market cap below the $100k floor as at least medium rug risk", async () => {
    const { db, inserted } = fakeDb();
    const pipeline = new FomoPipeline(db, fakeDexscreener({ marketCapUsd: 50_000 }));

    await pipeline.evaluatePair("ethereum", "0xpair");

    expect(inserted[0]?.rug_risk_level).toBe("medium");
  });

  it("folds Solana's real trained rugAnalyser risk in via score_events and heavily penalizes the score", async () => {
    const { db: cleanDb, inserted: cleanInserted } = fakeDb({ score: 80, risk_level: "low" });
    const cleanPipeline = new FomoPipeline(cleanDb, fakeDexscreener());
    const cleanScore = await cleanPipeline.evaluatePair("solana", "solPair");

    const { db: rugDb, inserted: rugInserted } = fakeDb({ score: 5, risk_level: "critical" });
    const rugPipeline = new FomoPipeline(rugDb, fakeDexscreener());
    const rugScore = await rugPipeline.evaluatePair("solana", "solPair");

    expect(rugInserted[0]?.rug_risk_level).toBe("critical");
    expect(rugScore!).toBeLessThan(cleanScore!);
    const signals = rugInserted[0]?.signals as { rugRisk: { solanaTrained: { riskLevel: string } } };
    expect(signals.rugRisk.solanaTrained.riskLevel).toBe("critical");
    expect(cleanInserted[0]?.rug_risk_level).not.toBe("critical");
  });

  it("does not look up score_events for non-Solana chains even if a row exists for that address", async () => {
    const { db, inserted } = fakeDb({ score: 5, risk_level: "critical" });
    const pipeline = new FomoPipeline(db, fakeDexscreener());

    await pipeline.evaluatePair("bsc", "0xpair");

    const signals = inserted[0]?.signals as { rugRisk: { solanaTrained: unknown } };
    expect(signals.rugRisk.solanaTrained).toBeNull();
  });
});

describe("FomoPipeline.resolvePairAddress", () => {
  it("returns the highest-liquidity pair address for a token", async () => {
    const { db } = fakeDb();
    const dexscreener = {
      getPair: async () => DEFAULT_PAIR,
      getTokenPairs: async () => [
        { ...DEFAULT_PAIR, pairAddress: "low-liq", liquidityUsd: 1_000 },
        { ...DEFAULT_PAIR, pairAddress: "high-liq", liquidityUsd: 100_000 },
      ],
    };
    const pipeline = new FomoPipeline(db, dexscreener);

    const pairAddress = await pipeline.resolvePairAddress("solana", "mint123");
    expect(pairAddress).toBe("high-liq");
  });

  it("returns null when the token has no known pairs", async () => {
    const { db } = fakeDb();
    const dexscreener = { getPair: async () => DEFAULT_PAIR, getTokenPairs: async () => [] };
    const pipeline = new FomoPipeline(db, dexscreener);

    expect(await pipeline.resolvePairAddress("solana", "mint123")).toBeNull();
  });
});

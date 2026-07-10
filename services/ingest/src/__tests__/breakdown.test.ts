import { describe, expect, it } from "vitest";
import { momentumScore, bondingCurveScore, computeBreakdown, WEIGHTS } from "../breakdown.js";
import type { ScoringMetrics } from "../metrics.js";

const BASE_METRICS: ScoringMetrics = {
  mint: "mint",
  liquiditySol: 40,
  liquidityUsd: 4000,
  volume5mUsd: 5000,
  volume15mUsd: 10_000,
  priceChange5mPct: 20,
  priceChange15mPct: 20,
  holderCount: 300,
  top3HolderPct: 10,
  devHoldingPct: 3,
  hasTwitter: true,
  hasTelegram: true,
  telegramActive: true,
  bondingCurvePct: 50,
  marketCapUsd: 50_000,
  priceSol: 0.0001,
  priceUsd: 0.01,
  graduation: "bonding_curve",
  stale: false,
};

describe("momentumScore", () => {
  it("scores near-zero for a dead token (no volume, flat price)", () => {
    const score = momentumScore({ volume5mUsd: 0, priceChange5mPct: 0, priceChange15mPct: 0 });
    expect(score).toBe(0);
  });

  it("rewards healthy positive momentum in the 10-150% zone", () => {
    const score = momentumScore({ volume5mUsd: 5000, priceChange5mPct: 100, priceChange15mPct: 100 });
    expect(score).toBeCloseTo(0.8333, 3);
    expect(score).toBeGreaterThan(momentumScore({ volume5mUsd: 5000, priceChange5mPct: 10, priceChange15mPct: 10 }));
  });

  it("penalizes a parabolic move (>400%) as likely already topped", () => {
    const modest = momentumScore({ volume5mUsd: 5000, priceChange5mPct: 100, priceChange15mPct: 100 });
    const parabolic = momentumScore({ volume5mUsd: 5000, priceChange5mPct: 500, priceChange15mPct: 500 });
    expect(parabolic).toBeLessThan(modest);
  });
});

describe("bondingCurveScore", () => {
  it("scores the 20-80% progress sweet spot highest", () => {
    expect(bondingCurveScore({ graduation: "bonding_curve", bondingCurvePct: 50 })).toBe(1.0);
  });

  it("scores a brand-new curve (<5%) as unproven", () => {
    expect(bondingCurveScore({ graduation: "bonding_curve", bondingCurvePct: 2 })).toBe(0.2);
  });

  it("scores graduated pools reasonably (less upside, but not risky)", () => {
    expect(bondingCurveScore({ graduation: "graduated", bondingCurvePct: 100 })).toBe(0.7);
  });

  it("scores unknown graduation status neutrally-low", () => {
    expect(bondingCurveScore({ graduation: "unknown", bondingCurvePct: 0 })).toBe(0.3);
  });
});

describe("computeBreakdown", () => {
  it("sums to the full WEIGHTS total for an ideal token", () => {
    const ideal: ScoringMetrics = {
      ...BASE_METRICS,
      liquiditySol: 1000,
      top3HolderPct: 0,
      devHoldingPct: 2,
      marketCapUsd: 10_000,
    };
    const b = computeBreakdown(ideal);
    expect(b.liquidity).toBe(WEIGHTS.liquidity);
    expect(b.holderDistribution).toBe(WEIGHTS.holderDistribution);
    expect(b.devBehaviour).toBe(WEIGHTS.devBehaviour);
    expect(b.socialSignals).toBe(WEIGHTS.socialSignals);
    expect(b.marketCapEntry).toBe(WEIGHTS.marketCapEntry);
  });

  it("zeroes out holderDistribution once top3HolderPct reaches the max threshold", () => {
    const b = computeBreakdown({ ...BASE_METRICS, top3HolderPct: 30 });
    expect(b.holderDistribution).toBe(0);
  });

  it("zeroes out marketCapEntry once market cap is far above the entry sweet spot", () => {
    const b = computeBreakdown({ ...BASE_METRICS, marketCapUsd: 1_000_000 });
    expect(b.marketCapEntry).toBe(0);
  });
});

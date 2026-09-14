import { describe, expect, it } from "vitest";
import type { FomoMetrics } from "@solana-trust-layer/analysers";
import {
  FOMO_WEIGHTS,
  buyPressureScore,
  computeFomoBreakdown,
  freshnessScore,
  liquidityHealthScore,
  priceActionScore,
  roomToRunScore,
  volumeAccelerationScore,
} from "../fomo-breakdown.js";

const BASE_METRICS: FomoMetrics = {
  liquidityUsd: 20_000,
  volume5mUsd: 4_000,
  volume1hUsd: 12_000,
  priceChange5mPct: 20,
  priceChange1hPct: 20,
  buys5m: 30,
  sells5m: 5,
  pairAgeMinutes: 10,
  marketCapUsd: 200_000,
};

describe("volumeAccelerationScore", () => {
  it("scores zero when there's no volume at all", () => {
    expect(volumeAccelerationScore({ volume5mUsd: 0, volume1hUsd: 0 })).toBe(0);
  });

  it("maxes out at a 5x+ five-minute run-rate", () => {
    expect(volumeAccelerationScore({ volume5mUsd: 5_000, volume1hUsd: 12_000 })).toBe(1);
  });

  it("scores proportionally between 0 and 5x", () => {
    const score = volumeAccelerationScore({ volume5mUsd: 2_000, volume1hUsd: 12_000 });
    expect(score).toBeCloseTo(0.4, 5);
  });
});

describe("buyPressureScore", () => {
  it("returns a neutral-low score below the minimum sample size", () => {
    expect(buyPressureScore({ buys5m: 2, sells5m: 0 })).toBe(0.3);
  });

  it("scores the raw buy ratio once enough transactions exist", () => {
    expect(buyPressureScore({ buys5m: 8, sells5m: 2 })).toBe(0.8);
  });
});

describe("liquidityHealthScore", () => {
  it("penalizes illiquid pools", () => {
    expect(liquidityHealthScore({ liquidityUsd: 1_000 })).toBe(0.1);
  });

  it("rewards the early sweet spot", () => {
    expect(liquidityHealthScore({ liquidityUsd: 50_000 })).toBe(1.0);
  });

  it("scores a deep/mature pool lower — the early window has likely passed", () => {
    expect(liquidityHealthScore({ liquidityUsd: 1_000_000 })).toBe(0.3);
  });
});

describe("freshnessScore", () => {
  it("scores a brand-new pair highest", () => {
    expect(freshnessScore({ pairAgeMinutes: 5 })).toBe(1.0);
  });

  it("scores an old pair lowest", () => {
    expect(freshnessScore({ pairAgeMinutes: 500 })).toBe(0.2);
  });
});

describe("priceActionScore", () => {
  it("penalizes an already-parabolic move as likely topped", () => {
    expect(priceActionScore({ priceChange5mPct: 200, priceChange1hPct: 200 })).toBe(0.2);
  });

  it("penalizes broken momentum", () => {
    expect(priceActionScore({ priceChange5mPct: -20, priceChange1hPct: 0 })).toBe(0.1);
  });

  it("rewards a confirmed early move", () => {
    expect(priceActionScore({ priceChange5mPct: 20, priceChange1hPct: 20 })).toBe(1.0);
  });
});

describe("roomToRunScore", () => {
  it("rewards a low market cap with confirmed upward movement", () => {
    const score = roomToRunScore({ marketCapUsd: 100_000, priceChange5mPct: 20, priceChange1hPct: 20 });
    expect(score).toBeCloseTo(1.0, 5);
  });

  it("scores a large market cap lower even with good price action", () => {
    const score = roomToRunScore({ marketCapUsd: 10_000_000, priceChange5mPct: 20, priceChange1hPct: 20 });
    expect(score).toBeCloseTo(0.6, 5);
  });

  it("treats a market cap below the $100k floor as a rug-risk red flag, not room to run", () => {
    const belowFloor = roomToRunScore({ marketCapUsd: 50_000, priceChange5mPct: 20, priceChange1hPct: 20 });
    const atFloor = roomToRunScore({ marketCapUsd: 100_000, priceChange5mPct: 20, priceChange1hPct: 20 });
    expect(belowFloor).toBeLessThan(atFloor);
    expect(belowFloor).toBeCloseTo(0.525, 5); // 0.05 * 0.5 + 1.0 * 0.5
  });
});

describe("computeFomoBreakdown", () => {
  it("sums to the full WEIGHTS total for an ideal early-momentum candidate", () => {
    const ideal: FomoMetrics = {
      liquidityUsd: 50_000,
      volume5mUsd: 5_000,
      volume1hUsd: 12_000,
      priceChange5mPct: 20,
      priceChange1hPct: 20,
      buys5m: 20,
      sells5m: 0,
      pairAgeMinutes: 5,
      marketCapUsd: 100_000,
    };
    const b = computeFomoBreakdown(ideal);
    expect(b.volumeAcceleration).toBe(FOMO_WEIGHTS.volumeAcceleration);
    expect(b.buyPressure).toBe(FOMO_WEIGHTS.buyPressure);
    expect(b.liquidityHealth).toBe(FOMO_WEIGHTS.liquidityHealth);
    expect(b.freshness).toBe(FOMO_WEIGHTS.freshness);
    expect(b.roomToRun).toBe(FOMO_WEIGHTS.roomToRun);
  });

  it("produces a lower total for a stale, illiquid, already-pumped pair", () => {
    const bad = computeFomoBreakdown({
      ...BASE_METRICS,
      liquidityUsd: 500,
      pairAgeMinutes: 1000,
      priceChange5mPct: 300,
      priceChange1hPct: 300,
      marketCapUsd: 20_000_000,
    });
    const good = computeFomoBreakdown(BASE_METRICS);
    const total = (b: ReturnType<typeof computeFomoBreakdown>) =>
      b.volumeAcceleration + b.buyPressure + b.liquidityHealth + b.freshness + b.roomToRun;
    expect(total(bad)).toBeLessThan(total(good));
  });
});

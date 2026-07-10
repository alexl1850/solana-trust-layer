import { describe, expect, it } from "vitest";
import { computeRugPatternIds, computeMoonPatternIds } from "../pattern-signals.js";

const BASE = {
  top3HolderPct: 10,
  liquiditySol: 40,
  priceChange5mPct: 5,
  volume5mUsd: 5000,
  holderCount: 300,
  priceSol: 0.0001,
  graduationStatus: "bonding_curve" as const,
};

describe("computeRugPatternIds", () => {
  it("flags concentrated holders, thin liquidity, and low volume together", () => {
    const ids = computeRugPatternIds({
      ...BASE,
      top3HolderPct: 60,
      liquiditySol: 10,
      volume5mUsd: 400,
      holderCount: 30,
    });
    expect(ids).toContain("top3_holders_above_50pct");
    expect(ids).toContain("liquidity_below_15sol");
    expect(ids).toContain("liquidity_below_25sol");
    expect(ids).toContain("volume_5m_below_1k");
    expect(ids).toContain("holder_count_below_50");
  });

  it("uses only the highest holder-concentration bucket (mutually exclusive)", () => {
    const ids = computeRugPatternIds({ ...BASE, top3HolderPct: 60 });
    expect(ids.filter((id) => id.startsWith("top3_holders_above_"))).toEqual(["top3_holders_above_50pct"]);
  });

  it("returns no patterns for a clean-looking healthy token", () => {
    const ids = computeRugPatternIds({ ...BASE, priceSol: 0.5 });
    expect(ids).toEqual([]);
  });
});

describe("computeMoonPatternIds", () => {
  it("flags healthy distribution, strong liquidity, and graduation together", () => {
    const ids = computeMoonPatternIds({
      ...BASE,
      top3HolderPct: 10,
      liquiditySol: 80,
      priceChange5mPct: 60,
      volume5mUsd: 20_000,
      holderCount: 600,
      graduationStatus: "graduated",
    });
    expect(ids).toContain("top3_holders_below_15pct");
    expect(ids).toContain("liquidity_above_50sol");
    expect(ids).toContain("price_up_50pct_5m");
    expect(ids).toContain("volume_5m_above_10k");
    expect(ids).toContain("holder_count_above_500");
    expect(ids).toContain("status_graduated");
  });

  it("returns no patterns for a mediocre token", () => {
    const ids = computeMoonPatternIds({
      ...BASE,
      top3HolderPct: 40,
      liquiditySol: 5,
      priceChange5mPct: -5,
      volume5mUsd: 500,
      holderCount: 20,
    });
    expect(ids).toEqual([]);
  });
});

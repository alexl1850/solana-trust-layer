import { describe, expect, it } from "vitest";
import { computeFomoPatternIds, type FomoMetrics } from "../fomo-signals.js";

const BASE: FomoMetrics = {
  liquidityUsd: 500_000,
  volume5mUsd: 1_000,
  volume1hUsd: 12_000,
  priceChange5mPct: 0,
  priceChange1hPct: 0,
  buys5m: 0,
  sells5m: 0,
  pairAgeMinutes: 200,
  marketCapUsd: 5_000_000,
};

describe("computeFomoPatternIds", () => {
  it("flags a fresh pair with accelerating volume and strong buy pressure", () => {
    const ids = computeFomoPatternIds({
      ...BASE,
      pairAgeMinutes: 10,
      volume5mUsd: 8_000,
      volume1hUsd: 12_000,
      buys5m: 40,
      sells5m: 5,
      liquidityUsd: 15_000,
      priceChange5mPct: 25,
      marketCapUsd: 200_000,
    });
    expect(ids).toContain("pair_age_under_15min");
    expect(ids).toContain("volume_accel_5m_gt_4x_hourly_rate");
    expect(ids).toContain("buy_pressure_above_80pct");
    expect(ids).toContain("liquidity_early_sweet_spot");
    expect(ids).toContain("price_up_5_to_40pct_5m_early_move");
    expect(ids).toContain("market_cap_under_500k_room_to_run");
  });

  it("uses only the youngest pair-age bucket (mutually exclusive)", () => {
    const ids = computeFomoPatternIds({ ...BASE, pairAgeMinutes: 10 });
    expect(ids).toContain("pair_age_under_15min");
    expect(ids).not.toContain("pair_age_under_60min");
    expect(ids).not.toContain("pair_age_under_120min");
  });

  it("does not flag freshness for an old pair", () => {
    const ids = computeFomoPatternIds({ ...BASE, pairAgeMinutes: 500 });
    expect(ids).not.toContain("pair_age_under_15min");
    expect(ids).not.toContain("pair_age_under_60min");
    expect(ids).not.toContain("pair_age_under_120min");
  });

  it("does not flag volume acceleration when hourly rate has no volume at all", () => {
    const ids = computeFomoPatternIds({ ...BASE, volume5mUsd: 0, volume1hUsd: 0 });
    expect(ids).not.toContain("volume_accel_5m_gt_2x_hourly_rate");
    expect(ids).not.toContain("volume_accel_5m_gt_4x_hourly_rate");
  });

  it("requires a minimum transaction sample before flagging buy pressure", () => {
    const ids = computeFomoPatternIds({ ...BASE, buys5m: 2, sells5m: 0 });
    expect(ids).not.toContain("buy_pressure_above_80pct");
  });

  it("flags an already-parabolic move as likely late instead of an early move", () => {
    const ids = computeFomoPatternIds({ ...BASE, priceChange5mPct: 200 });
    expect(ids).toContain("price_already_parabolic_likely_late");
    expect(ids).not.toContain("price_up_5_to_40pct_5m_early_move");
  });

  it("flags broken momentum on a sharp 5m drop", () => {
    const ids = computeFomoPatternIds({ ...BASE, priceChange5mPct: -20 });
    expect(ids).toContain("price_down_5m_momentum_broken");
  });

  it("flags illiquid pairs below the $3k floor", () => {
    const ids = computeFomoPatternIds({ ...BASE, liquidityUsd: 1_000 });
    expect(ids).toContain("liquidity_below_3k_illiquid");
    expect(ids).not.toContain("liquidity_early_sweet_spot");
  });

  it("returns no market-cap bucket once well above the $3m ceiling", () => {
    const ids = computeFomoPatternIds({ ...BASE, marketCapUsd: 10_000_000 });
    expect(ids).not.toContain("market_cap_under_500k_room_to_run");
    expect(ids).not.toContain("market_cap_under_3m");
  });

  it("returns an empty pattern list for a flat, stale, old pair", () => {
    const ids = computeFomoPatternIds(BASE);
    expect(ids).toEqual([]);
  });
});

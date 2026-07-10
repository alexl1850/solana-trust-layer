import { describe, expect, it } from "vitest";
import { shouldPostReceipt, computeDrawdownPct } from "../receipts-poster.js";

describe("shouldPostReceipt", () => {
  const base = {
    mint: "abc",
    riskLevel: "critical",
    peakLiquidityUsd: 100_000,
    currentLiquidityUsd: 15_000,
    alreadyPosted: false,
  };

  it("posts when a HIGH/CRITICAL token drops >80% liquidity", () => {
    expect(shouldPostReceipt(base)).toBe(true);
  });

  it("does not post below the 80% drawdown threshold", () => {
    expect(shouldPostReceipt({ ...base, currentLiquidityUsd: 30_000 })).toBe(false);
  });

  it("does not post for low/medium risk tokens even with a big drawdown", () => {
    expect(shouldPostReceipt({ ...base, riskLevel: "low" })).toBe(false);
  });

  it("does not double-post", () => {
    expect(shouldPostReceipt({ ...base, alreadyPosted: true })).toBe(false);
  });
});

describe("computeDrawdownPct", () => {
  it("computes percentage drawdown from peak to current", () => {
    expect(computeDrawdownPct(100_000, 20_000)).toBe(80);
  });

  it("returns 0 for a zero peak instead of dividing by zero", () => {
    expect(computeDrawdownPct(0, 0)).toBe(0);
  });
});

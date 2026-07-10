import { describe, expect, it } from "vitest";
import { computeClusterReputation, riskLevelFromScore } from "../reputation.js";

describe("computeClusterReputation", () => {
  it("returns null (UNKNOWN) for a cluster with no launch history", () => {
    const score = computeClusterReputation({
      rugCount: 0,
      moonCount: 0,
      tokensLaunched: 0,
      msSinceLastLaunch: null,
    });
    expect(score).toBeNull();
    expect(riskLevelFromScore(score)).toBe("unknown");
  });

  it("scores a serial-rugger cluster (3 prior rugs) near zero", () => {
    const score = computeClusterReputation({
      rugCount: 3,
      moonCount: 0,
      tokensLaunched: 3,
      msSinceLastLaunch: 60 * 60 * 1000, // 1 hour ago — fully weighted
    });
    expect(score).not.toBeNull();
    expect(score!).toBeLessThan(25);
    expect(riskLevelFromScore(score)).toBe("critical");
  });

  it("scores a clean track record highly", () => {
    const score = computeClusterReputation({
      rugCount: 0,
      moonCount: 2,
      tokensLaunched: 2,
      msSinceLastLaunch: 60 * 60 * 1000,
    });
    expect(score!).toBeGreaterThanOrEqual(80);
    expect(riskLevelFromScore(score)).toBe("low");
  });

  it("discounts old rugs via recency weighting", () => {
    const recent = computeClusterReputation({
      rugCount: 1,
      moonCount: 0,
      tokensLaunched: 1,
      msSinceLastLaunch: 60 * 60 * 1000,
    })!;
    const old = computeClusterReputation({
      rugCount: 1,
      moonCount: 0,
      tokensLaunched: 1,
      msSinceLastLaunch: 365 * 24 * 60 * 60 * 1000,
    })!;
    expect(old).toBeGreaterThan(recent);
  });
});

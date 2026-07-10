import { describe, expect, it } from "vitest";
import { combineFinalScore } from "../scoring.js";
import type { ScoreBreakdown } from "../breakdown.js";

const ZERO_BREAKDOWN: ScoreBreakdown = {
  liquidity: 0,
  momentum: 0,
  holderDistribution: 0,
  devBehaviour: 0,
  socialSignals: 0,
  bondingCurve: 0,
  marketCapEntry: 0,
};

const FULL_BREAKDOWN: ScoreBreakdown = {
  liquidity: 20,
  momentum: 20,
  holderDistribution: 15,
  devBehaviour: 15,
  socialSignals: 10,
  bondingCurve: 10,
  marketCapEntry: 10,
};

describe("combineFinalScore", () => {
  it("scores 0 when every component is at its floor", () => {
    const result = combineFinalScore({
      breakdown: ZERO_BREAKDOWN,
      rug: { score: 0 },
      moon: { score: 0 },
      divergence: { penalty: 0 },
      clusterReputationScore: null,
    });
    expect(result.score).toBe(0);
    expect(result.riskLevel).toBe("critical");
  });

  it("scores 100 when every component is maxed and no penalties apply", () => {
    const result = combineFinalScore({
      breakdown: FULL_BREAKDOWN,
      rug: { score: 0 },
      moon: { score: 0 },
      divergence: { penalty: 0 },
      clusterReputationScore: 100,
    });
    expect(result.score).toBe(100);
    expect(result.riskLevel).toBe("low");
  });

  it("subtracts the learned rug penalty from the breakdown total", () => {
    const result = combineFinalScore({
      breakdown: FULL_BREAKDOWN,
      rug: { score: -20 }, // max learned penalty
      moon: { score: 0 },
      divergence: { penalty: 0 },
      clusterReputationScore: 100,
    });
    expect(result.score).toBe(80);
  });

  it("adds the learned moon bonus, clamped at 100", () => {
    const result = combineFinalScore({
      breakdown: FULL_BREAKDOWN,
      rug: { score: 0 },
      moon: { score: 15 }, // max learned bonus
      divergence: { penalty: 0 },
      clusterReputationScore: 100,
    });
    expect(result.score).toBe(100); // 100 + 15 clamped
  });

  it("applies a cluster penalty proportional to how far reputation is below 70, capped at 20", () => {
    const zeroRep = combineFinalScore({
      breakdown: ZERO_BREAKDOWN,
      rug: { score: 0 },
      moon: { score: 0 },
      divergence: { penalty: 0 },
      clusterReputationScore: 0,
    });
    expect(zeroRep.score).toBe(0); // already at floor, clamped

    const midRep = combineFinalScore({
      breakdown: FULL_BREAKDOWN,
      rug: { score: 0 },
      moon: { score: 0 },
      divergence: { penalty: 0 },
      clusterReputationScore: 0, // (70-0)/70 * 20 = 20 point penalty
    });
    expect(midRep.score).toBe(80);
  });

  it("does not penalize an UNKNOWN cluster (null reputation) — neutral, not punitive", () => {
    const result = combineFinalScore({
      breakdown: FULL_BREAKDOWN,
      rug: { score: 0 },
      moon: { score: 0 },
      divergence: { penalty: 0 },
      clusterReputationScore: null,
    });
    expect(result.score).toBe(100);
  });

  it("volume-divergence penalty subtracts, and its strong-momentum bonus (negative penalty) adds", () => {
    const penalized = combineFinalScore({
      breakdown: FULL_BREAKDOWN,
      rug: { score: 0 },
      moon: { score: 0 },
      divergence: { penalty: 15 },
      clusterReputationScore: 100,
    });
    expect(penalized.score).toBe(85);

    const bonused = combineFinalScore({
      breakdown: ZERO_BREAKDOWN,
      rug: { score: 0 },
      moon: { score: 0 },
      divergence: { penalty: -5 },
      clusterReputationScore: 100,
    });
    expect(bonused.score).toBe(5);
  });
});

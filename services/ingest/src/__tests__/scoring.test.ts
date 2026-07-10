import { describe, expect, it } from "vitest";
import { combineScores } from "../scoring.js";

const UNKNOWN = { score: null, signals: [], stale: true };

describe("combineScores", () => {
  it("returns UNKNOWN when no signal source has a confident read", () => {
    const result = combineScores({ rug: UNKNOWN, moon: UNKNOWN, cluster: { reputationScore: null } });
    expect(result.score).toBeNull();
    expect(result.riskLevel).toBe("unknown");
  });

  it("falls back to cluster reputation alone when analysers are stubbed out", () => {
    const result = combineScores({ rug: UNKNOWN, moon: UNKNOWN, cluster: { reputationScore: 10 } });
    expect(result.score).toBe(10);
    expect(result.riskLevel).toBe("critical");
  });

  it("blends all three sources when all are present", () => {
    const result = combineScores({
      rug: { score: 90, signals: [], stale: false },
      moon: { score: 90, signals: [], stale: false },
      cluster: { reputationScore: 90 },
    });
    expect(result.score).toBe(90);
    expect(result.riskLevel).toBe("low");
  });

  it("weights a bad cluster reputation heavily even with clean analyser scores", () => {
    const result = combineScores({
      rug: { score: 90, signals: [], stale: false },
      moon: { score: 90, signals: [], stale: false },
      cluster: { reputationScore: 0 },
    });
    // 90*0.3 + 90*0.2 + 0*0.5 = 45
    expect(result.score).toBe(45);
    expect(result.riskLevel).toBe("high");
  });
});

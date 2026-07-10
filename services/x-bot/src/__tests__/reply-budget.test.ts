import { describe, expect, it } from "vitest";
import { isNearingCap, selectPrioritized } from "../reply-budget.js";

describe("isNearingCap", () => {
  it("is false well under the cap", () => {
    expect(isNearingCap({ repliesUsedToday: 100, dailyBudget: 1000 })).toBe(false);
  });

  it("is true at 90% usage", () => {
    expect(isNearingCap({ repliesUsedToday: 900, dailyBudget: 1000 })).toBe(true);
  });
});

describe("selectPrioritized", () => {
  const candidates = [
    { mint: "low-velocity", mentionVelocity: 1 },
    { mint: "mid-velocity", mentionVelocity: 5 },
    { mint: "high-velocity", mentionVelocity: 50 },
    { mint: "another-low", mentionVelocity: 2 },
    { mint: "another-high", mentionVelocity: 40 },
  ];

  it("passes every candidate through when under budget pressure", () => {
    const result = selectPrioritized(candidates, { repliesUsedToday: 10, dailyBudget: 1000 });
    expect(result).toHaveLength(candidates.length);
  });

  it("keeps only the top fraction by mention velocity when nearing cap", () => {
    const result = selectPrioritized(candidates, { repliesUsedToday: 950, dailyBudget: 1000 }, 0.4);
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.mint)).toEqual(["high-velocity", "another-high"]);
  });

  it("always keeps at least one candidate even with a tiny fraction", () => {
    const result = selectPrioritized(candidates, { repliesUsedToday: 950, dailyBudget: 1000 }, 0.01);
    expect(result).toHaveLength(1);
    expect(result[0]!.mint).toBe("high-velocity");
  });
});

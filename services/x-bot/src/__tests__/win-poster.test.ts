import { describe, expect, it } from "vitest";
import { shouldPostWin, computeMultiple } from "../win-poster.js";

const base = {
  mint: "abc",
  riskLevel: "low",
  entryPriceUsd: 0.001,
  peakPriceUsd: 0.005, // 5x
  currentPriceUsd: 0.003, // 40% pulled back from peak
  alreadyPosted: false,
};

describe("shouldPostWin", () => {
  it("posts once a >=2x peak is confirmed by a >=20% pullback", () => {
    expect(shouldPostWin(base)).toBe(true);
  });

  it("does not post while price is still at/near its peak (no confirmed top yet)", () => {
    expect(shouldPostWin({ ...base, currentPriceUsd: 0.0049 })).toBe(false); // <20% pullback
  });

  it("does not post for a risk level other than low", () => {
    expect(shouldPostWin({ ...base, riskLevel: "medium" })).toBe(false);
  });

  it("does not post under the minimum multiple, even with a confirmed pullback", () => {
    expect(shouldPostWin({ ...base, peakPriceUsd: 0.0015, currentPriceUsd: 0.001 })).toBe(false); // 1.5x
  });

  it("never double-posts", () => {
    expect(shouldPostWin({ ...base, alreadyPosted: true })).toBe(false);
  });

  it("guards against zero/missing prices", () => {
    expect(shouldPostWin({ ...base, entryPriceUsd: 0 })).toBe(false);
    expect(shouldPostWin({ ...base, peakPriceUsd: 0 })).toBe(false);
  });
});

describe("computeMultiple", () => {
  it("computes peak / entry", () => {
    expect(computeMultiple(0.001, 0.044)).toBeCloseTo(44, 5);
  });

  it("returns 0 for a zero entry price instead of dividing by zero", () => {
    expect(computeMultiple(0, 0.005)).toBe(0);
  });
});

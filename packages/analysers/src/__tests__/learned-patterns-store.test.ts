import { describe, expect, it } from "vitest";
import { LearnedPatternsStore } from "../learned-patterns-store.js";

function fakeDb(rows: Array<{ id: string; weight: number }>) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          in: async () => ({ data: rows, error: null }),
        }),
      }),
    }),
  } as any;
}

describe("LearnedPatternsStore", () => {
  it("sums strong-weight rug patterns at 8x and mid-weight at 4x, capped at 20", () => {
    const store = new LearnedPatternsStore(
      fakeDb([
        { id: "a", weight: 1.0 }, // > 0.6 -> *8
        { id: "b", weight: 0.5 }, // > 0.4 -> *4
        { id: "c", weight: 0.1 }, // below both thresholds -> 0
      ]),
    );
    // a: 1*8=8, b: 0.5*4=2, c: 0 => 10, under cap
    return store.learnedPenalty(["a", "b", "c"]).then((penalty) => {
      expect(penalty).toBeCloseTo(10, 5);
    });
  });

  it("caps rug penalty at 20 even with many strong patterns", async () => {
    const store = new LearnedPatternsStore(
      fakeDb([
        { id: "a", weight: 1.0 },
        { id: "b", weight: 1.0 },
        { id: "c", weight: 1.0 },
        { id: "d", weight: 1.0 },
      ]),
    );
    const penalty = await store.learnedPenalty(["a", "b", "c", "d"]);
    expect(penalty).toBe(20);
  });

  it("caps moon bonus at 15", async () => {
    const store = new LearnedPatternsStore(
      fakeDb([
        { id: "a", weight: 1.0 },
        { id: "b", weight: 1.0 },
        { id: "c", weight: 1.0 },
        { id: "d", weight: 1.0 },
      ]),
    );
    const bonus = await store.moonBonus(["a", "b", "c", "d"]);
    expect(bonus).toBe(15);
  });

  it("ignores patterns with no learned weight (unseen ids)", async () => {
    const store = new LearnedPatternsStore(fakeDb([]));
    const penalty = await store.learnedPenalty(["unknown_pattern"]);
    expect(penalty).toBe(0);
  });

  it("returns 0 without querying when given an empty pattern list", async () => {
    const store = new LearnedPatternsStore(fakeDb([]));
    expect(await store.learnedPenalty([])).toBe(0);
    expect(await store.moonBonus([])).toBe(0);
  });
});

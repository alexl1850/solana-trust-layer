import { describe, expect, it } from "vitest";
import { detectVolumeDivergence } from "../volume-divergence.js";

describe("detectVolumeDivergence", () => {
  it("returns none when volume data is too thin to judge", () => {
    const result = detectVolumeDivergence(5, 5, 50, 50);
    expect(result.signal).toBe("none");
    expect(result.penalty).toBe(0);
  });

  it("flags distribution when price holds but volume drops sharply", () => {
    // 5m volume much lower than the 15m per-5min rate, price flat/up
    const result = detectVolumeDivergence(0, 0, 100, 3000);
    expect(result.signal).toBe("distribution");
    expect(result.penalty).toBe(10);
  });

  it("flags panic_dump when price crashes and volume spikes", () => {
    const result = detectVolumeDivergence(-20, -20, 3000, 300);
    expect(result.signal).toBe("panic_dump");
    expect(result.penalty).toBe(15);
  });

  it("flags strong_momentum (a bonus, negative penalty) on healthy rises", () => {
    const result = detectVolumeDivergence(15, 15, 2000, 600);
    expect(result.signal).toBe("strong_momentum");
    expect(result.penalty).toBe(-5);
  });

  it("returns none for unremarkable, steady conditions", () => {
    const result = detectVolumeDivergence(2, 2, 1000, 3000);
    expect(result.signal).toBe("none");
    expect(result.penalty).toBe(0);
  });
});

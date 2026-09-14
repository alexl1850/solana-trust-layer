import { describe, expect, it } from "vitest";
import { detectFomoRugDivergence } from "../fomo-divergence.js";

describe("detectFomoRugDivergence", () => {
  it("returns none when volume data is too thin to judge", () => {
    const result = detectFomoRugDivergence(5, 5, 50, 50);
    expect(result.signal).toBe("none");
    expect(result.penalty).toBe(0);
  });

  it("flags distribution when price holds but volume drops sharply vs the hourly rate", () => {
    // hourly rate per 5min = 12000/12 = 1000; 5m volume of 100 is a 0.1x ratio
    const result = detectFomoRugDivergence(0, 0, 100, 12_000);
    expect(result.signal).toBe("distribution");
    expect(result.penalty).toBe(10);
  });

  it("flags panic_dump when price crashes and volume spikes vs the hourly rate", () => {
    // hourly rate per 5min = 1200/12 = 100; 5m volume of 3000 is a 30x ratio
    const result = detectFomoRugDivergence(-20, -20, 3_000, 1_200);
    expect(result.signal).toBe("panic_dump");
    expect(result.penalty).toBe(15);
  });

  it("flags strong_momentum (a bonus, negative penalty) on healthy rises", () => {
    // hourly rate per 5min = 6000/12 = 500; 5m volume of 1000 is a 2x ratio
    const result = detectFomoRugDivergence(15, 15, 1_000, 6_000);
    expect(result.signal).toBe("strong_momentum");
    expect(result.penalty).toBe(-5);
  });

  it("returns none for unremarkable, steady conditions", () => {
    const result = detectFomoRugDivergence(2, 2, 1_000, 12_000);
    expect(result.signal).toBe("none");
    expect(result.penalty).toBe(0);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MultiChainFomoScanner } from "../multichain-scanner.js";

function fakePipeline(overrides: { resolvePairAddress?: (...args: any[]) => Promise<string | null> } = {}) {
  return {
    evaluatePair: vi.fn(async () => 50),
    resolvePairAddress: overrides.resolvePairAddress ?? (async () => null),
  } as any;
}

describe("MultiChainFomoScanner.watchToken", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("watches the pair immediately when it resolves on the first attempt", async () => {
    const pipeline = fakePipeline({ resolvePairAddress: async () => "solPair" });
    const scanner = new MultiChainFomoScanner(pipeline, {});

    await scanner.watchToken("solana", "mint123");

    expect(pipeline.evaluatePair).toHaveBeenCalledWith("solana", "solPair");
    scanner.stop();
  });

  it("retries resolution on a timer when the pair isn't indexed yet, then watches it once found", async () => {
    let attempt = 0;
    const pipeline = fakePipeline({
      resolvePairAddress: async () => {
        attempt += 1;
        return attempt >= 3 ? "solPair" : null;
      },
    });
    const scanner = new MultiChainFomoScanner(pipeline, {});

    const watchPromise = scanner.watchToken("solana", "mint123");
    await watchPromise;
    expect(pipeline.evaluatePair).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(30_000);
    expect(pipeline.evaluatePair).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(30_000);
    expect(pipeline.evaluatePair).toHaveBeenCalledWith("solana", "solPair");
    scanner.stop();
  });

  it("gives up after the retry window without ever finding a pair", async () => {
    const pipeline = fakePipeline({ resolvePairAddress: async () => null });
    const scanner = new MultiChainFomoScanner(pipeline, {});

    await scanner.watchToken("solana", "mint123");
    await vi.advanceTimersByTimeAsync(11 * 60_000);

    expect(pipeline.evaluatePair).not.toHaveBeenCalled();
    scanner.stop();
  });

  it("does not start a second resolution loop for a token already being resolved", async () => {
    const resolvePairAddress = vi.fn(async () => null);
    const pipeline = fakePipeline({ resolvePairAddress });
    const scanner = new MultiChainFomoScanner(pipeline, {});

    await scanner.watchToken("solana", "mint123");
    await scanner.watchToken("solana", "mint123");

    expect(resolvePairAddress).toHaveBeenCalledTimes(1);
    scanner.stop();
  });
});

describe("MultiChainFomoScanner.watchPair", () => {
  it("evaluates immediately and does not re-watch an already-watched pair", () => {
    vi.useFakeTimers();
    const pipeline = fakePipeline();
    const scanner = new MultiChainFomoScanner(pipeline, {});

    scanner.watchPair("ethereum", "0xpair");
    scanner.watchPair("ethereum", "0xpair");

    expect(pipeline.evaluatePair).toHaveBeenCalledTimes(1);
    scanner.stop();
    vi.useRealTimers();
  });

  it("stops re-checking once the 120-minute window elapses", async () => {
    vi.useFakeTimers();
    const pipeline = fakePipeline();
    const scanner = new MultiChainFomoScanner(pipeline, {});

    scanner.watchPair("ethereum", "0xpair");
    expect(pipeline.evaluatePair).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(121 * 60 * 1000);
    const callsAfterWindow = pipeline.evaluatePair.mock.calls.length;

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(pipeline.evaluatePair.mock.calls.length).toBe(callsAfterWindow);

    scanner.stop();
    vi.useRealTimers();
  });
});

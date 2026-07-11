import { describe, expect, it } from "vitest";
import { ReceiptsMonitor } from "../receipts-monitor.js";

function fakeRedis() {
  const store = new Map<string, string>();
  return {
    store,
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async set(key: string, value: string) {
      store.set(key, value);
      return "OK";
    },
  } as any;
}

function fakeTrustApi(scores: Record<string, { riskLevel: string }>) {
  return {
    async getFeed() {
      return Object.keys(scores).map((mint) => ({
        mint,
        score: 0,
        risk_level: scores[mint]!.riskLevel,
        trigger: "launch",
        created_at: new Date().toISOString(),
      }));
    },
    async getScore(mint: string) {
      const s = scores[mint];
      return s ? { mint, score: 0, riskLevel: s.riskLevel } : null;
    },
  } as any;
}

function fakeBirdeye(liquidityByMint: Record<string, number>, stale = false) {
  return {
    async tokenOverview(mint: string) {
      return { liquidityUsd: liquidityByMint[mint] ?? 0, stale };
    },
  } as any;
}

function fakeXClient() {
  const posted: string[] = [];
  return {
    posted,
    async postTweet(text: string) {
      posted.push(text);
      return "tweet-id";
    },
  } as any;
}

const OPTS = { reportBaseUrl: "https://app.example.com" };

describe("ReceiptsMonitor", () => {
  it("ignores tokens that are not HIGH/CRITICAL risk", async () => {
    const redis = fakeRedis();
    const xClient = fakeXClient();
    const monitor = new ReceiptsMonitor(
      redis,
      fakeTrustApi({ mintA: { riskLevel: "low" } }),
      fakeBirdeye({ mintA: 1000 }),
      xClient,
      OPTS,
    );
    await monitor.tick();
    expect(xClient.posted).toHaveLength(0);
  });

  it("does not post on the first sighting of a HIGH-risk token (no drawdown yet to measure)", async () => {
    const redis = fakeRedis();
    const xClient = fakeXClient();
    const monitor = new ReceiptsMonitor(
      redis,
      fakeTrustApi({ mintA: { riskLevel: "critical" } }),
      fakeBirdeye({ mintA: 100_000 }),
      xClient,
      OPTS,
    );
    await monitor.tick();
    expect(xClient.posted).toHaveLength(0);
    expect(redis.store.get("xbot:peak-liq:mintA")).toBe("100000");
  });

  it("posts a receipt once liquidity drops >80% from its tracked peak", async () => {
    const redis = fakeRedis();
    const xClient = fakeXClient();
    const trustApi = fakeTrustApi({ mintA: { riskLevel: "critical" } });

    const monitor1 = new ReceiptsMonitor(redis, trustApi, fakeBirdeye({ mintA: 100_000 }), xClient, OPTS);
    await monitor1.tick(); // establishes peak = 100,000

    const monitor2 = new ReceiptsMonitor(redis, trustApi, fakeBirdeye({ mintA: 10_000 }), xClient, OPTS);
    await monitor2.tick(); // 90% drawdown from peak

    expect(xClient.posted).toHaveLength(1);
    expect(xClient.posted[0]).toContain("mintA");
    expect(xClient.posted[0]).toContain("CRITICAL");
    expect(redis.store.get("xbot:receipt-posted:mintA")).toBe("1");
  });

  it("never double-posts the same rug", async () => {
    const redis = fakeRedis();
    redis.store.set("xbot:receipt-posted:mintA", "1");
    const xClient = fakeXClient();
    const monitor = new ReceiptsMonitor(
      redis,
      fakeTrustApi({ mintA: { riskLevel: "critical" } }),
      fakeBirdeye({ mintA: 1000 }),
      xClient,
      OPTS,
    );
    await monitor.tick();
    expect(xClient.posted).toHaveLength(0);
  });

  it("does not act on stale Birdeye data", async () => {
    const redis = fakeRedis();
    const xClient = fakeXClient();
    const monitor = new ReceiptsMonitor(
      redis,
      fakeTrustApi({ mintA: { riskLevel: "critical" } }),
      fakeBirdeye({ mintA: 1000 }, true),
      xClient,
      OPTS,
    );
    await monitor.tick();
    expect(xClient.posted).toHaveLength(0);
  });

  it("tracks the peak liquidity as the max seen, not the latest", async () => {
    const redis = fakeRedis();
    const xClient = fakeXClient();
    const trustApi = fakeTrustApi({ mintA: { riskLevel: "critical" } });

    await new ReceiptsMonitor(redis, trustApi, fakeBirdeye({ mintA: 50_000 }), xClient, OPTS).tick();
    await new ReceiptsMonitor(redis, trustApi, fakeBirdeye({ mintA: 80_000 }), xClient, OPTS).tick();
    expect(redis.store.get("xbot:peak-liq:mintA")).toBe("80000");

    // A dip that doesn't cross the 80% threshold from the true peak shouldn't post.
    await new ReceiptsMonitor(redis, trustApi, fakeBirdeye({ mintA: 30_000 }), xClient, OPTS).tick();
    expect(xClient.posted).toHaveLength(0);
    expect(redis.store.get("xbot:peak-liq:mintA")).toBe("80000"); // peak unchanged by a dip
  });
});

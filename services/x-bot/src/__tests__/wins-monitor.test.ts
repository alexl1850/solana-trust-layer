import { describe, expect, it } from "vitest";
import { WinsMonitor } from "../wins-monitor.js";

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

function fakeBirdeye(priceByMint: Record<string, number>, stale = false) {
  return {
    async tokenOverview(mint: string) {
      return { priceUsd: priceByMint[mint] ?? 0, stale };
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

describe("WinsMonitor", () => {
  it("ignores tokens that are not LOW risk", async () => {
    const redis = fakeRedis();
    const xClient = fakeXClient();
    const monitor = new WinsMonitor(
      redis,
      fakeTrustApi({ mintA: { riskLevel: "high" } }),
      fakeBirdeye({ mintA: 0.001 }),
      xClient,
      OPTS,
    );
    await monitor.tick();
    expect(xClient.posted).toHaveLength(0);
  });

  it("records the entry price on first sighting, doesn't post yet (no peak/pullback to confirm)", async () => {
    const redis = fakeRedis();
    const xClient = fakeXClient();
    const monitor = new WinsMonitor(
      redis,
      fakeTrustApi({ mintA: { riskLevel: "low" } }),
      fakeBirdeye({ mintA: 0.001 }),
      xClient,
      OPTS,
    );
    await monitor.tick();
    expect(xClient.posted).toHaveLength(0);
    expect(redis.store.get("xbot:entry-price:mintA")).toBe("0.001");
  });

  it("posts once price rises well above entry and then confirms the peak with a pullback", async () => {
    const redis = fakeRedis();
    const xClient = fakeXClient();
    const trustApi = fakeTrustApi({ mintA: { riskLevel: "low" } });

    await new WinsMonitor(redis, trustApi, fakeBirdeye({ mintA: 0.001 }), xClient, OPTS).tick(); // entry = 0.001
    await new WinsMonitor(redis, trustApi, fakeBirdeye({ mintA: 0.044 }), xClient, OPTS).tick(); // peak = 0.044 (44x), no pullback yet
    expect(xClient.posted).toHaveLength(0);

    await new WinsMonitor(redis, trustApi, fakeBirdeye({ mintA: 0.03 }), xClient, OPTS).tick(); // pulled back ~32% from peak

    expect(xClient.posted).toHaveLength(1);
    expect(xClient.posted[0]).toContain("mintA");
    expect(xClient.posted[0]).toContain("44.0x");
  });

  it("never double-posts the same call", async () => {
    const redis = fakeRedis();
    redis.store.set("xbot:win-posted:mintA", "1");
    const xClient = fakeXClient();
    const monitor = new WinsMonitor(
      redis,
      fakeTrustApi({ mintA: { riskLevel: "low" } }),
      fakeBirdeye({ mintA: 0.001 }),
      xClient,
      OPTS,
    );
    await monitor.tick();
    expect(xClient.posted).toHaveLength(0);
  });

  it("does not act on stale Birdeye data", async () => {
    const redis = fakeRedis();
    const xClient = fakeXClient();
    const monitor = new WinsMonitor(
      redis,
      fakeTrustApi({ mintA: { riskLevel: "low" } }),
      fakeBirdeye({ mintA: 0.001 }, true),
      xClient,
      OPTS,
    );
    await monitor.tick();
    expect(xClient.posted).toHaveLength(0);
  });
});

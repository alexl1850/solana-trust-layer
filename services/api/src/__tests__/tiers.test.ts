import { describe, expect, it } from "vitest";
import { resolveTier } from "../tiers.js";

const BASE = {
  holderMinBalance: 1_000_000n,
  apiProMinBalance: 10_000_000n,
  hasActiveSubscription: false,
  gracePeriodHours: 24,
  now: new Date("2026-01-01T00:00:00Z"),
};

describe("resolveTier", () => {
  it("grants holder tier immediately when balance qualifies", () => {
    const result = resolveTier({
      ...BASE,
      currentTier: "free",
      tokenBalance: 2_000_000n,
      gracePeriodStartedAt: null,
    });
    expect(result).toEqual({ tier: "holder", gracePeriodStartedAt: null });
  });

  it("grants api_pro over holder when balance qualifies for both", () => {
    const result = resolveTier({
      ...BASE,
      currentTier: "free",
      tokenBalance: 20_000_000n,
      gracePeriodStartedAt: null,
    });
    expect(result.tier).toBe("api_pro");
  });

  it("starts a grace period the first time a holder's balance drops, without downgrading yet", () => {
    const result = resolveTier({
      ...BASE,
      currentTier: "holder",
      tokenBalance: 100n,
      gracePeriodStartedAt: null,
    });
    expect(result.tier).toBe("holder");
    expect(result.gracePeriodStartedAt).toEqual(BASE.now);
  });

  it("keeps access mid-grace-period", () => {
    const gracePeriodStartedAt = new Date("2025-12-31T12:00:00Z"); // 12h before `now`
    const result = resolveTier({
      ...BASE,
      currentTier: "holder",
      tokenBalance: 100n,
      gracePeriodStartedAt,
    });
    expect(result.tier).toBe("holder");
    expect(result.gracePeriodStartedAt).toEqual(gracePeriodStartedAt);
  });

  it("downgrades to free once the grace period expires with no subscription", () => {
    const gracePeriodStartedAt = new Date("2025-12-30T00:00:00Z"); // 48h before `now`
    const result = resolveTier({
      ...BASE,
      currentTier: "holder",
      tokenBalance: 100n,
      gracePeriodStartedAt,
    });
    expect(result).toEqual({ tier: "free", gracePeriodStartedAt: null });
  });

  it("downgrades to paid (not free) if a Stripe subscription is active", () => {
    const gracePeriodStartedAt = new Date("2025-12-30T00:00:00Z");
    const result = resolveTier({
      ...BASE,
      currentTier: "api_pro",
      tokenBalance: 0n,
      gracePeriodStartedAt,
      hasActiveSubscription: true,
    });
    expect(result).toEqual({ tier: "paid", gracePeriodStartedAt: null });
  });

  it("never applies a grace period to a user who was never a balance tier", () => {
    const result = resolveTier({
      ...BASE,
      currentTier: "free",
      tokenBalance: 0n,
      gracePeriodStartedAt: null,
    });
    expect(result).toEqual({ tier: "free", gracePeriodStartedAt: null });
  });
});

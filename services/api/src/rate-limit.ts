import type { Redis } from "ioredis";
import type { UserTier } from "@solana-trust-layer/db";

/** null = unlimited. Free tier's "3 score lookups/day" cap lives here (PROJECT.md Phase 3). */
export const TIER_LIMITS: Record<UserTier, { scoreLookupsPerDay: number | null; requestsPerMinute: number }> = {
  free: { scoreLookupsPerDay: 3, requestsPerMinute: 10 },
  paid: { scoreLookupsPerDay: null, requestsPerMinute: 60 },
  holder: { scoreLookupsPerDay: null, requestsPerMinute: 60 },
  api_pro: { scoreLookupsPerDay: null, requestsPerMinute: 300 },
};

export interface RateLimitCheck {
  allowed: boolean;
  remaining: number | null;
}

export class TierRateLimiter {
  constructor(private readonly redis: Redis) {}

  async checkScoreLookup(userId: string, tier: UserTier): Promise<RateLimitCheck> {
    const limit = TIER_LIMITS[tier].scoreLookupsPerDay;
    if (limit === null) return { allowed: true, remaining: null };

    const dayKey = new Date().toISOString().slice(0, 10);
    const key = `ratelimit:score:${userId}:${dayKey}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, 60 * 60 * 24);

    return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
  }

  async checkRequestBudget(userId: string, tier: UserTier): Promise<RateLimitCheck> {
    const limit = TIER_LIMITS[tier].requestsPerMinute;
    const minuteKey = Math.floor(Date.now() / 60_000);
    const key = `ratelimit:req:${userId}:${minuteKey}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, 60);

    return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
  }
}

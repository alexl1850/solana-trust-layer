import type { UserTier } from "@solana-trust-layer/db";

export interface TierResolutionInput {
  currentTier: UserTier;
  tokenBalance: bigint;
  holderMinBalance: bigint;
  apiProMinBalance: bigint;
  hasActiveSubscription: boolean;
  gracePeriodStartedAt: Date | null;
  gracePeriodHours: number;
  now: Date;
}

export interface TierResolutionResult {
  tier: UserTier;
  gracePeriodStartedAt: Date | null;
}

/**
 * PROJECT.md Phase 3: "If balance drops below threshold at re-check: 24h
 * grace period with warning email/notification, then downgrade to free.
 * Do NOT hard-cut instantly." This is the only place that decision is made
 * — called from the balance-recheck job (every 8h) and from
 * POST /v1/auth/verify.
 */
export function resolveTier(input: TierResolutionInput): TierResolutionResult {
  const balanceTier: UserTier | null =
    input.tokenBalance >= input.apiProMinBalance
      ? "api_pro"
      : input.tokenBalance >= input.holderMinBalance
        ? "holder"
        : null;

  // Balance currently qualifies for a holder/api_pro tier: grant it immediately, clear any grace period.
  if (balanceTier) {
    return { tier: balanceTier, gracePeriodStartedAt: null };
  }

  const wasBalanceTier = input.currentTier === "holder" || input.currentTier === "api_pro";
  const fallbackTier: UserTier = input.hasActiveSubscription ? "paid" : "free";

  if (!wasBalanceTier) {
    // Never was in a balance tier — no grace period applies, just reflect subscription state.
    return { tier: fallbackTier, gracePeriodStartedAt: null };
  }

  if (!input.gracePeriodStartedAt) {
    // Balance just dropped below threshold: start the clock, keep current access for now.
    return { tier: input.currentTier, gracePeriodStartedAt: input.now };
  }

  const graceElapsedMs = input.now.getTime() - input.gracePeriodStartedAt.getTime();
  const graceWindowMs = input.gracePeriodHours * 60 * 60 * 1000;

  if (graceElapsedMs < graceWindowMs) {
    // Still within the grace window: keep current access.
    return { tier: input.currentTier, gracePeriodStartedAt: input.gracePeriodStartedAt };
  }

  // Grace period expired: downgrade.
  return { tier: fallbackTier, gracePeriodStartedAt: null };
}

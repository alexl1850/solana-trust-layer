export interface ClusterStats {
  rugCount: number;
  moonCount: number;
  tokensLaunched: number;
  /** ms since the cluster's most recent launch, or null if it has never launched anything traceable */
  msSinceLastLaunch: number | null;
}

/** Half-life for recency weighting: a rug from a year ago counts for much less than one from last week. */
const RECENCY_HALF_LIFE_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

/**
 * Cluster reputation score, 0-100. 0 = confirmed serial rugger, 100 = clean
 * track record. Returns null (UNKNOWN) when the cluster has no traceable
 * launch history at all — per PROJECT.md this is itself a risk signal and
 * must be surfaced as UNKNOWN, never faked as a numeric score.
 */
export function computeClusterReputation(stats: ClusterStats): number | null {
  if (stats.tokensLaunched === 0) return null;

  const recencyWeight =
    stats.msSinceLastLaunch === null
      ? 1
      : Math.pow(0.5, stats.msSinceLastLaunch / RECENCY_HALF_LIFE_MS);

  const rugPenalty = stats.rugCount * 30 * recencyWeight;
  const moonBonus = stats.moonCount * 15;

  const raw = 100 - rugPenalty + moonBonus - (stats.tokensLaunched - stats.rugCount - stats.moonCount) * 2;

  return Math.max(0, Math.min(100, Math.round(raw * 100) / 100));
}

export function riskLevelFromScore(score: number | null): "unknown" | "low" | "medium" | "high" | "critical" {
  if (score === null) return "unknown";
  if (score >= 80) return "low";
  if (score >= 55) return "medium";
  if (score >= 25) return "high";
  return "critical";
}

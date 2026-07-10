export interface ReceiptCandidate {
  mint: string;
  riskLevel: string;
  peakLiquidityUsd: number;
  currentLiquidityUsd: number;
  alreadyPosted: boolean;
}

const DRAWDOWN_THRESHOLD_PCT = 80;

/**
 * PROJECT.md Phase 5: "when a token we scored HIGH/CRITICAL drops >80%
 * liquidity, post the receipt to our own timeline." Pure predicate — the
 * caller supplies current liquidity state and whether it's already posted
 * (tracked in Redis, same as reply dedupe).
 */
export function shouldPostReceipt(candidate: ReceiptCandidate): boolean {
  if (candidate.alreadyPosted) return false;
  if (candidate.riskLevel !== "high" && candidate.riskLevel !== "critical") return false;
  if (candidate.peakLiquidityUsd <= 0) return false;

  const drawdownPct = (1 - candidate.currentLiquidityUsd / candidate.peakLiquidityUsd) * 100;
  return drawdownPct > DRAWDOWN_THRESHOLD_PCT;
}

export function computeDrawdownPct(peakLiquidityUsd: number, currentLiquidityUsd: number): number {
  if (peakLiquidityUsd <= 0) return 0;
  return Math.max(0, (1 - currentLiquidityUsd / peakLiquidityUsd) * 100);
}

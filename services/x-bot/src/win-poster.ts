export interface WinCandidate {
  mint: string;
  riskLevel: string;
  entryPriceUsd: number;
  peakPriceUsd: number;
  currentPriceUsd: number;
  alreadyPosted: boolean;
}

/** Don't call a peak until price has pulled back this far from it — otherwise we'd be claiming a top we can't confirm. */
const PULLBACK_CONFIRMATION_PCT = 20;
/** Not worth a card under this multiple. */
const MIN_MULTIPLE = 2;

/**
 * Hypothetical-performance receipt for the win side: "we scored this LOW
 * risk at $X, it peaked at $Y before pulling back — that's an Nx." This is
 * NOT a trade, executed or simulated with real timing logic — it's a
 * transparent, after-the-fact readout of (price when we called it low-risk)
 * vs (highest price reached since, confirmed by a real pullback so we're
 * not claiming a top nobody could have called). No position sizing, no
 * entries/exits, no execution — see PROJECT.md hard rule #1.
 */
export function shouldPostWin(candidate: WinCandidate): boolean {
  if (candidate.alreadyPosted) return false;
  if (candidate.riskLevel !== "low") return false;
  if (candidate.entryPriceUsd <= 0 || candidate.peakPriceUsd <= 0) return false;

  const multiple = computeMultiple(candidate.entryPriceUsd, candidate.peakPriceUsd);
  if (multiple < MIN_MULTIPLE) return false;

  const pullbackFromPeakPct = ((candidate.peakPriceUsd - candidate.currentPriceUsd) / candidate.peakPriceUsd) * 100;
  return pullbackFromPeakPct >= PULLBACK_CONFIRMATION_PCT;
}

export function computeMultiple(entryPriceUsd: number, peakPriceUsd: number): number {
  if (entryPriceUsd <= 0) return 0;
  return peakPriceUsd / entryPriceUsd;
}

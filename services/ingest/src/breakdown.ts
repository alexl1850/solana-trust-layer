import type { ScoringMetrics } from "./metrics.js";

/** Ported verbatim from the source bot's `scoring.ts` WEIGHTS (sum = 100). */
export const WEIGHTS = {
  liquidity: 20,
  momentum: 20,
  holderDistribution: 15,
  devBehaviour: 15,
  socialSignals: 10,
  bondingCurve: 10,
  marketCapEntry: 10,
} as const;

// Source config defaults (BotConfig in the trading bot was live-editable from
// a dashboard; hardcoded here as sane defaults for a public scorer).
const MIN_LIQUIDITY_SOL = 10;
const MAX_TOP3_HOLDER_PCT = 30;
const MAX_DEV_HOLDING_PCT = 10;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export interface ScoreBreakdown {
  liquidity: number;
  momentum: number;
  holderDistribution: number;
  devBehaviour: number;
  socialSignals: number;
  bondingCurve: number;
  marketCapEntry: number;
}

export function momentumScore(m: Pick<ScoringMetrics, "volume5mUsd" | "priceChange5mPct" | "priceChange15mPct">): number {
  const volScore = clamp(m.volume5mUsd / 5000, 0, 1) * 0.5;
  const chg = Math.max(m.priceChange5mPct, m.priceChange15mPct);
  let priceScore: number;
  if (chg <= 0) priceScore = 0;
  else if (chg <= 150) priceScore = clamp(chg / 150, 0, 1);
  else if (chg <= 400) priceScore = clamp(1 - (chg - 150) / 250, 0.3, 1);
  else priceScore = 0.2;
  return volScore + priceScore * 0.5;
}

export function bondingCurveScore(m: Pick<ScoringMetrics, "graduation" | "bondingCurvePct">): number {
  if (m.graduation === "graduated") return 0.7;
  if (m.graduation === "unknown") return 0.3;
  const p = m.bondingCurvePct;
  if (p < 5) return 0.2;
  if (p <= 20) return 0.6;
  if (p <= 80) return 1.0;
  return 0.5;
}

export function computeBreakdown(m: ScoringMetrics): ScoreBreakdown {
  return {
    liquidity: clamp(m.liquiditySol / (MIN_LIQUIDITY_SOL * 4), 0, 1) * WEIGHTS.liquidity,
    momentum: momentumScore(m) * WEIGHTS.momentum,
    holderDistribution: clamp(1 - m.top3HolderPct / MAX_TOP3_HOLDER_PCT, 0, 1) * WEIGHTS.holderDistribution,
    devBehaviour:
      clamp(1 - Math.max(0, m.devHoldingPct - 2) / Math.max(1, MAX_DEV_HOLDING_PCT - 2), 0, 1) * WEIGHTS.devBehaviour,
    socialSignals:
      ((m.hasTwitter ? 0.5 : 0) + (m.hasTelegram ? 0.25 : 0) + (m.telegramActive ? 0.25 : 0)) * WEIGHTS.socialSignals,
    bondingCurve: bondingCurveScore(m) * WEIGHTS.bondingCurve,
    marketCapEntry: clamp(1 - (m.marketCapUsd - 50_000) / 450_000, 0, 1) * WEIGHTS.marketCapEntry,
  };
}

export function breakdownTotal(b: ScoreBreakdown): number {
  return (
    b.liquidity + b.momentum + b.holderDistribution + b.devBehaviour + b.socialSignals + b.bondingCurve + b.marketCapEntry
  );
}

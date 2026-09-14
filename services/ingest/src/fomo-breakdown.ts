import type { FomoMetrics } from "@solana-trust-layer/analysers";

/**
 * Heuristic early-volume / pre-FOMO scorer (weights sum to 100), mirroring
 * breakdown.ts's WEIGHTS-based shape. Unlike breakdown.ts — ported from the
 * source bot's real trained `scoring.ts` — these weights are a NEW,
 * untested heuristic (see packages/analysers/src/fomo-signals.ts's doc
 * comment: no historical labeled dataset backs this yet). Treat the
 * resulting score as a candidate filter worth backtesting, never as a
 * predicted or guaranteed return. This module only scores/alerts — it
 * never places an order (PROJECT.md hard rule 1).
 */
export const FOMO_WEIGHTS = {
  volumeAcceleration: 30,
  buyPressure: 25,
  liquidityHealth: 20,
  freshness: 15,
  roomToRun: 10,
} as const;

/**
 * Below this market cap a token is treated as a rug-risk red flag rather
 * than "room to run" — a thin float this small is the easiest to move with
 * one wallet and the easiest to rug outright, so it no longer earns
 * roomToRun credit (see roomToRunScore below and fomo-pipeline.ts's
 * rug-risk gating).
 */
export const MIN_MARKET_CAP_USD = 100_000;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export interface FomoScoreBreakdown {
  volumeAcceleration: number;
  buyPressure: number;
  liquidityHealth: number;
  freshness: number;
  roomToRun: number;
}

export function volumeAccelerationScore(m: Pick<FomoMetrics, "volume5mUsd" | "volume1hUsd">): number {
  const hourlyRatePerFiveMin = m.volume1hUsd / 12;
  if (hourlyRatePerFiveMin <= 0) return m.volume5mUsd > 0 ? 1 : 0;
  const ratio = m.volume5mUsd / hourlyRatePerFiveMin;
  return clamp(ratio / 5, 0, 1); // a 5x+ run-rate maxes out the score
}

export function buyPressureScore(m: Pick<FomoMetrics, "buys5m" | "sells5m">): number {
  const total = m.buys5m + m.sells5m;
  if (total < 5) return 0.3; // not enough sample to trust either way
  return clamp(m.buys5m / total, 0, 1);
}

export function liquidityHealthScore(m: Pick<FomoMetrics, "liquidityUsd">): number {
  if (m.liquidityUsd < 3_000) return 0.1; // too thin: high slippage / manipulation risk
  if (m.liquidityUsd <= 150_000) return 1.0; // early sweet spot
  if (m.liquidityUsd <= 500_000) return 0.6; // maturing, early window closing
  return 0.3; // deep/mature pool — early window has likely already passed
}

export function freshnessScore(m: Pick<FomoMetrics, "pairAgeMinutes">): number {
  if (m.pairAgeMinutes < 15) return 1.0;
  if (m.pairAgeMinutes < 60) return 0.8;
  if (m.pairAgeMinutes < 120) return 0.5;
  return 0.2;
}

export function priceActionScore(m: Pick<FomoMetrics, "priceChange5mPct" | "priceChange1hPct">): number {
  if (m.priceChange5mPct > 150 || m.priceChange1hPct > 300) return 0.2; // likely already topped
  if (m.priceChange5mPct < -10) return 0.1; // momentum broken
  if (m.priceChange5mPct > 5) return 1.0; // confirmed real buying
  return 0.5; // flat — no confirmation either way
}

export function roomToRunScore(
  m: Pick<FomoMetrics, "marketCapUsd" | "priceChange5mPct" | "priceChange1hPct">,
): number {
  let capScore: number;
  if (m.marketCapUsd <= 0) capScore = 0.3; // unknown market cap, treat neutrally-low
  else if (m.marketCapUsd < MIN_MARKET_CAP_USD) capScore = 0.05; // below the floor — rug-risk zone, not "room to run"
  else if (m.marketCapUsd < 500_000) capScore = 1.0;
  else if (m.marketCapUsd < 3_000_000) capScore = 0.6;
  else capScore = 0.2;
  return capScore * 0.5 + priceActionScore(m) * 0.5;
}

export function computeFomoBreakdown(m: FomoMetrics): FomoScoreBreakdown {
  return {
    volumeAcceleration: volumeAccelerationScore(m) * FOMO_WEIGHTS.volumeAcceleration,
    buyPressure: buyPressureScore(m) * FOMO_WEIGHTS.buyPressure,
    liquidityHealth: liquidityHealthScore(m) * FOMO_WEIGHTS.liquidityHealth,
    freshness: freshnessScore(m) * FOMO_WEIGHTS.freshness,
    roomToRun: roomToRunScore(m) * FOMO_WEIGHTS.roomToRun,
  };
}

export function fomoBreakdownTotal(b: FomoScoreBreakdown): number {
  return b.volumeAcceleration + b.buyPressure + b.liquidityHealth + b.freshness + b.roomToRun;
}

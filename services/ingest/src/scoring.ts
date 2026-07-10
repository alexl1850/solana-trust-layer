import { riskLevelFromScore } from "@solana-trust-layer/wallet-graph";
import type { RiskLevel } from "@solana-trust-layer/db";
import type { AnalysisResult } from "@solana-trust-layer/analysers";
import type { DivergenceResult } from "./volume-divergence.js";
import { breakdownTotal, type ScoreBreakdown } from "./breakdown.js";

export interface FinalScore {
  score: number | null;
  riskLevel: RiskLevel;
}

export interface CombineInputs {
  breakdown: ScoreBreakdown;
  /** score = -learnedPenalty (0..-20), from packages/analysers RugAnalyser */
  rug: Pick<AnalysisResult, "score">;
  /** score = +moonBonus (0..+15), from packages/analysers MoonAnalyser */
  moon: Pick<AnalysisResult, "score">;
  /** positive = penalty, negative = bonus (strong_momentum) */
  divergence: Pick<DivergenceResult, "penalty">;
  clusterReputationScore: number | null;
}

/**
 * Final score arithmetic — replaces the source bot's `scoreToken()` combine
 * step (breakdown + learned bonuses - learned penalties - dev-wallet
 * penalty). The one substantive change: the source's `devWalletTracker`
 * penalty/hard-reject is replaced by our wallet-graph cluster reputation,
 * which actually works (the source's version had a bug — see
 * packages/analysers/src/dev-wallet-tracker.ts — that made it a no-op in
 * production). Everything else mirrors the real, trained scoring formula.
 *
 * Callers must have already handled the stale-data case (metrics.stale)
 * upstream and short-circuited to UNKNOWN — this function assumes valid,
 * fresh inputs.
 */
export function combineFinalScore(inputs: CombineInputs): FinalScore {
  const clusterPenalty =
    inputs.clusterReputationScore === null ? 0 : Math.max(0, (70 - inputs.clusterReputationScore) / 70) * 20;

  const raw =
    breakdownTotal(inputs.breakdown) + (inputs.rug.score ?? 0) + (inputs.moon.score ?? 0) - inputs.divergence.penalty - clusterPenalty;

  const score = Math.round(Math.max(0, Math.min(100, raw)) * 100) / 100;
  return { score, riskLevel: riskLevelFromScore(score) };
}

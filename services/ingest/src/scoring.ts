import type { AnalysisResult } from "@solana-trust-layer/analysers";
import type { ClusterResult } from "@solana-trust-layer/wallet-graph";
import { riskLevelFromScore } from "@solana-trust-layer/wallet-graph";
import type { RiskLevel } from "@solana-trust-layer/db";

export interface ScoringInputs {
  rug: AnalysisResult;
  moon: AnalysisResult;
  cluster: Pick<ClusterResult, "reputationScore">;
}

export interface FinalScore {
  score: number | null;
  riskLevel: RiskLevel;
}

/**
 * Blends the three signal sources into one public score (0-100, higher =
 * safer), or null (UNKNOWN) if none of them produced a confident read.
 *
 * Cluster reputation currently carries the most weight (0.5) because it's
 * the moat and the only fully-implemented signal today; rug/moon analyser
 * weight (0.3/0.2) is reserved for once the real port lands — until then
 * they contribute nothing (stub analysers always return null/stale).
 */
const WEIGHTS = { rug: 0.3, moon: 0.2, cluster: 0.5 } as const;

export function combineScores(inputs: ScoringInputs): FinalScore {
  const parts: Array<{ score: number; weight: number }> = [];

  if (inputs.rug.score !== null) parts.push({ score: inputs.rug.score, weight: WEIGHTS.rug });
  if (inputs.moon.score !== null) parts.push({ score: inputs.moon.score, weight: WEIGHTS.moon });
  if (inputs.cluster.reputationScore !== null) {
    parts.push({ score: inputs.cluster.reputationScore, weight: WEIGHTS.cluster });
  }

  if (parts.length === 0) return { score: null, riskLevel: "unknown" };

  const totalWeight = parts.reduce((sum, p) => sum + p.weight, 0);
  const weighted = parts.reduce((sum, p) => sum + p.score * p.weight, 0) / totalWeight;
  const score = Math.round(weighted * 100) / 100;

  return { score, riskLevel: riskLevelFromScore(score) };
}

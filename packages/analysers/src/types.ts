import type { TokenPriceLiquidity } from "@solana-trust-layer/shared";

export interface AnalyserSignal {
  name: string;
  /** -1 (strongly rug-like) .. +1 (strongly moon-like) */
  value: number;
  weight: number;
  stale: boolean;
}

export interface AnalyserContext {
  mint: string;
  deployerWallet: string;
  priceLiquidity: TokenPriceLiquidity;
  launchedAt: Date;
  /** cluster reputation score from packages/wallet-graph, null if UNKNOWN */
  clusterReputationScore: number | null;
}

export interface AnalysisResult {
  /** null = UNKNOWN — analyser could not produce a confident read */
  score: number | null;
  signals: AnalyserSignal[];
  stale: boolean;
}

export const UNKNOWN_RESULT: AnalysisResult = { score: null, signals: [], stale: true };

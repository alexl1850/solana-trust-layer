export type GraduationStatus = "bonding_curve" | "graduated" | "unknown";

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
  top3HolderPct: number;
  liquiditySol: number;
  liquidityUsd: number;
  volume5mUsd: number;
  priceChange5mPct: number;
  holderCount: number;
  priceSol: number;
  graduationStatus: GraduationStatus;
  /** true when upstream (Birdeye) data is missing/unreliable — analysers must degrade to UNKNOWN */
  stale: boolean;
}

export interface AnalysisResult {
  /**
   * null = UNKNOWN. Otherwise a signed adjustment, not an independent 0-100
   * score: RugAnalyser returns the learned-penalty as a negative number
   * (0..-20), MoonAnalyser returns the learned-bonus as a positive number
   * (0..+15). services/ingest sums these into the main WEIGHTS-based score.
   */
  score: number | null;
  signals: AnalyserSignal[];
  stale: boolean;
}

export const UNKNOWN_RESULT: AnalysisResult = { score: null, signals: [], stale: true };

export type RiskLevel = "unknown" | "low" | "medium" | "high" | "critical";
export type TokenOutcome = "rug" | "moon" | "unresolved";
export type UserTier = "free" | "paid" | "holder" | "api_pro";
export type ScoreTrigger =
  | "launch"
  | "dev_wallet_movement"
  | "lp_change"
  | "volume_divergence"
  | "safety_poll";

/** Solana was the only chain until the multi-chain early-volume alert feature (see fomo_events). */
export type Chain = "solana" | "ethereum" | "base" | "bsc";

export interface Wallet {
  address: string;
  first_seen_at: string;
  tx_count: number;
  is_cex: boolean;
  is_bridge: boolean;
  is_infrastructure: boolean;
  label: string | null;
  cluster_id: string | null;
  updated_at: string;
}

export interface Cluster {
  id: string;
  rug_count: number;
  moon_count: number;
  tokens_launched: number;
  /** null = UNKNOWN — cluster has no traceable history, this is itself a risk signal */
  reputation_score: number | null;
  last_launch_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WalletFundingEdge {
  id: string;
  from_wallet: string;
  to_wallet: string;
  amount_lamports: number;
  signature: string;
  slot: number;
  block_time: string;
  hop: number;
  discovered_at: string;
}

export interface Token {
  mint: string;
  deployer_wallet: string;
  name: string | null;
  symbol: string | null;
  launched_at: string;
  outcome: TokenOutcome;
  outcome_resolved_at: string | null;
  outcome_details: Record<string, unknown> | null;
  chain: Chain;
}

export interface ScoreEvent {
  id: string;
  mint: string;
  /** null = UNKNOWN */
  score: number | null;
  risk_level: RiskLevel;
  trigger: ScoreTrigger;
  signals: Record<string, unknown>;
  cluster_id: string | null;
  created_at: string;
  chain: Chain;
}

/**
 * A candidate matching a pre-FOMO early-volume-acceleration heuristic
 * (detect-and-alert only, see PROJECT.md hard rule 1 — no execution).
 * Deliberately not a ScoreEvent: `fomo_score` is an opportunity-shape match,
 * not a risk score, so it doesn't reuse RiskLevel semantics for the score
 * itself — but `rug_risk_level` (added alongside rug-detection integration)
 * does reuse RiskLevel, since that field genuinely is a risk assessment:
 * the real trained rugAnalyser/moonAnalyser output (via score_events) for
 * Solana, or the chain-agnostic divergence heuristic elsewhere.
 */
export interface FomoEvent {
  id: string;
  chain: Chain;
  token_address: string;
  pair_address: string;
  dex_id: string | null;
  symbol: string | null;
  name: string | null;
  /** null = UNKNOWN (stale/unusable upstream data). A heuristic pattern-match score, not a predicted return. */
  fomo_score: number | null;
  /** null = UNKNOWN (stale data, or not yet assessed). */
  rug_risk_level: RiskLevel | null;
  signals: Record<string, unknown>;
  pair_created_at: string | null;
  created_at: string;
}

export interface Receipt {
  id: string;
  period_start: string;
  period_end: string;
  merkle_root: string;
  event_count: number;
  solana_tx_signature: string | null;
  anchored_at: string | null;
  created_at: string;
}

export interface User {
  id: string;
  wallet_address: string;
  tier: UserTier;
  token_balance: number;
  balance_checked_at: string | null;
  grace_period_started_at: string | null;
  stripe_customer_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface FundingAncestorRow {
  wallet: string;
  hop: number;
  path: string[];
}

export type PatternKind = "rug" | "moon";

/** Ported from the source bot's patternStore.ts / moonStore.ts learned-weight system. */
export interface LearnedPattern {
  id: string;
  kind: PatternKind;
  description: string;
  positive_count: number;
  negative_count: number;
  weight: number;
  last_seen: string;
}

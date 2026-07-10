export type RiskLevel = "unknown" | "low" | "medium" | "high" | "critical";
export type TokenOutcome = "rug" | "moon" | "unresolved";
export type UserTier = "free" | "paid" | "holder" | "api_pro";
export type ScoreTrigger =
  | "launch"
  | "dev_wallet_movement"
  | "lp_change"
  | "volume_divergence"
  | "safety_poll";

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

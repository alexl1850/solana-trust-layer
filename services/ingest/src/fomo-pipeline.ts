import type { SupabaseClient } from "@supabase/supabase-js";
import type { DexScreenerClient, DexScreenerChainId } from "@solana-trust-layer/shared";
import type { RiskLevel } from "@solana-trust-layer/db";
import { computeFomoPatternIds } from "@solana-trust-layer/analysers";
import { gatherFomoMetrics } from "./fomo-metrics.js";
import { computeFomoBreakdown, fomoBreakdownTotal, MIN_MARKET_CAP_USD } from "./fomo-breakdown.js";
import { detectFomoRugDivergence, type FomoDivergenceResult } from "./fomo-divergence.js";

const RISK_RANK: Record<RiskLevel, number> = { unknown: -1, low: 0, medium: 1, high: 2, critical: 3 };

/** Combines two independent risk assessments, keeping whichever is worse (unknown never overrides a known one). */
function worseRiskLevel(a: RiskLevel, b: RiskLevel): RiskLevel {
  if (a === "unknown") return b;
  if (b === "unknown") return a;
  return RISK_RANK[a] >= RISK_RANK[b] ? a : b;
}

function riskLevelFromDivergenceSignal(signal: FomoDivergenceResult["signal"]): RiskLevel {
  switch (signal) {
    case "panic_dump":
      return "high";
    case "distribution":
      return "medium";
    case "strong_momentum":
      return "low";
    default:
      return "unknown";
  }
}

/** A float this thin is the easiest to move with one wallet and the easiest to rug outright — flag it regardless of momentary price/volume signals. */
function mcapFloorRiskLevel(marketCapUsd: number): RiskLevel {
  if (marketCapUsd <= 0) return "unknown";
  return marketCapUsd < MIN_MARKET_CAP_USD ? "medium" : "unknown";
}

/** Extra score penalty layered on top of the divergence heuristic when Solana's real trained rugAnalyser flags risk. */
const TRAINED_RUG_PENALTY: Record<RiskLevel, number> = { unknown: 0, low: 0, medium: 5, high: 15, critical: 30 };

interface SolanaRugAssessment {
  score: number | null;
  riskLevel: RiskLevel;
}

/**
 * Writes one `fomo_events` row per evaluation (hard rule 3: every public
 * alert must be reproducible from the stored row — signals carries the
 * full breakdown + pattern ids + rug-risk assessment). Detect-and-alert
 * only: this never places an order or touches a wallet (hard rule 1).
 *
 * Rug detection is integrated two ways:
 *  - Every chain gets the chain-agnostic distribution/panic_dump
 *    divergence heuristic (fomo-divergence.ts) — the only signal available
 *    for Ethereum/Base/BSC, which have no holder-distribution or
 *    dev-wallet-cluster data source yet.
 *  - Solana additionally reuses the REAL trained rugAnalyser/moonAnalyser
 *    output: the existing ScoringPipeline already scores every Solana
 *    launch into `score_events` (backed by the source bot's 87-labeled-rug
 *    / 100-labeled-moon dataset), so this pipeline just reads the token's
 *    latest score_events row rather than re-implementing rug detection.
 */
export class FomoPipeline {
  constructor(
    private readonly db: SupabaseClient,
    private readonly dexscreener: Pick<DexScreenerClient, "getPair" | "getTokenPairs">,
  ) {}

  /** Evaluates one pair and records the result. Returns the score, or null when degraded to UNKNOWN. */
  async evaluatePair(chain: DexScreenerChainId, pairAddress: string): Promise<number | null> {
    const metrics = await gatherFomoMetrics(chain, pairAddress, this.dexscreener);

    // Hard rule: stale/unusable upstream data degrades to UNKNOWN, never a fabricated score.
    if (metrics.stale) {
      const { error } = await this.db.from("fomo_events").insert({
        chain,
        token_address: metrics.tokenAddress || "unknown",
        pair_address: pairAddress,
        dex_id: metrics.dexId || null,
        symbol: metrics.symbol || null,
        name: metrics.name || null,
        fomo_score: null,
        rug_risk_level: null,
        signals: { reason: "stale_upstream_data" },
        pair_created_at: null,
      });
      if (error) throw new Error(`insert fomo_event: ${error.message}`);
      return null;
    }

    const patternIds = computeFomoPatternIds(metrics);
    const breakdown = computeFomoBreakdown(metrics);
    const divergence = detectFomoRugDivergence(
      metrics.priceChange5mPct,
      metrics.priceChange1hPct,
      metrics.volume5mUsd,
      metrics.volume1hUsd,
    );

    let rugRiskLevel = worseRiskLevel(
      riskLevelFromDivergenceSignal(divergence.signal),
      mcapFloorRiskLevel(metrics.marketCapUsd),
    );

    let solanaRug: SolanaRugAssessment | null = null;
    if (chain === "solana") {
      solanaRug = await this.lookupSolanaRugScore(metrics.tokenAddress);
      if (solanaRug) rugRiskLevel = worseRiskLevel(rugRiskLevel, solanaRug.riskLevel);
    }

    const trainedRugPenalty = solanaRug ? TRAINED_RUG_PENALTY[solanaRug.riskLevel] : 0;
    const rawScore = fomoBreakdownTotal(breakdown) - divergence.penalty - trainedRugPenalty;
    const score = Math.round(Math.max(0, Math.min(100, rawScore)) * 100) / 100;

    const pairCreatedAt = Number.isFinite(metrics.pairAgeMinutes)
      ? new Date(Date.now() - metrics.pairAgeMinutes * 60_000).toISOString()
      : null;

    const { error } = await this.db.from("fomo_events").insert({
      chain,
      token_address: metrics.tokenAddress,
      pair_address: metrics.pairAddress,
      dex_id: metrics.dexId || null,
      symbol: metrics.symbol || null,
      name: metrics.name || null,
      fomo_score: score,
      rug_risk_level: rugRiskLevel,
      signals: { breakdown, patternIds, rugRisk: { divergence, solanaTrained: solanaRug } },
      pair_created_at: pairCreatedAt,
    });
    if (error) throw new Error(`insert fomo_event: ${error.message}`);
    return score;
  }

  /** Best DexScreener pair for a token by address (highest liquidity) — used to resolve a Solana mint into a pairAddress for watchToken(). */
  async resolvePairAddress(chain: DexScreenerChainId, tokenAddress: string): Promise<string | null> {
    const pairs = await this.dexscreener.getTokenPairs(chain, tokenAddress);
    if (pairs.length === 0) return null;
    const best = pairs.reduce((a, b) => (b.liquidityUsd > a.liquidityUsd ? b : a));
    return best.pairAddress || null;
  }

  private async lookupSolanaRugScore(mint: string): Promise<SolanaRugAssessment | null> {
    const { data, error } = await this.db
      .from("score_events")
      .select("score, risk_level")
      .eq("mint", mint)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (error || !data) return null;
    return { score: data.score as number | null, riskLevel: data.risk_level as RiskLevel };
  }
}

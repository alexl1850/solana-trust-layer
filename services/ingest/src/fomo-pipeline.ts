import type { SupabaseClient } from "@supabase/supabase-js";
import type { DexScreenerClient, DexScreenerChainId } from "@solana-trust-layer/shared";
import { computeFomoPatternIds } from "@solana-trust-layer/analysers";
import { gatherFomoMetrics } from "./fomo-metrics.js";
import { computeFomoBreakdown, fomoBreakdownTotal } from "./fomo-breakdown.js";

/**
 * Writes one `fomo_events` row per evaluation (hard rule 3: every public
 * alert must be reproducible from the stored row — signals carries the
 * full breakdown + pattern ids). Detect-and-alert only: this never places
 * an order or touches a wallet (hard rule 1).
 */
export class FomoPipeline {
  constructor(
    private readonly db: SupabaseClient,
    private readonly dexscreener: Pick<DexScreenerClient, "getPair">,
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
        signals: { reason: "stale_upstream_data" },
        pair_created_at: null,
      });
      if (error) throw new Error(`insert fomo_event: ${error.message}`);
      return null;
    }

    const patternIds = computeFomoPatternIds(metrics);
    const breakdown = computeFomoBreakdown(metrics);
    const score = Math.round(Math.max(0, Math.min(100, fomoBreakdownTotal(breakdown))) * 100) / 100;

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
      signals: { breakdown, patternIds },
      pair_created_at: pairCreatedAt,
    });
    if (error) throw new Error(`insert fomo_event: ${error.message}`);
    return score;
  }
}

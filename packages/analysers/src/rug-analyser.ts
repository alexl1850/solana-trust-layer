import type { AnalyserContext, AnalysisResult } from "./types.js";
import { UNKNOWN_RESULT } from "./types.js";
import { computeRugPatternIds } from "./pattern-signals.js";
import type { LearnedPatternsStore } from "./learned-patterns-store.js";

export interface RugAnalyser {
  analyse(ctx: AnalyserContext): Promise<AnalysisResult>;
}

/**
 * Ported from the source bot's `rugAnalyser` + `patternStore` — the core of
 * the public risk scorer (PROJECT.md Phase 1/2).
 *
 * The source bot computed these same pattern thresholds twice: once live at
 * scoring time (in `scoring.ts`) to look up `learnedPenalty`, and once
 * post-trade-close (in `rugAnalyser.ts`) to feed new observations back into
 * `patternStore`. We only need the live half — the training/backfill half
 * is the `learned_patterns` table, seeded from the source bot's real
 * accumulated data (87 labeled rugs).
 *
 * Preserves the RUG_EXIT false-positive fix: stale Birdeye data degrades to
 * UNKNOWN, never CRITICAL.
 */
export class DefaultRugAnalyser implements RugAnalyser {
  constructor(private readonly patterns: LearnedPatternsStore) {}

  async analyse(ctx: AnalyserContext): Promise<AnalysisResult> {
    if (ctx.stale) return UNKNOWN_RESULT;

    const patternIds = computeRugPatternIds({
      top3HolderPct: ctx.top3HolderPct,
      liquiditySol: ctx.liquiditySol,
      priceChange5mPct: ctx.priceChange5mPct,
      volume5mUsd: ctx.volume5mUsd,
      holderCount: ctx.holderCount,
      priceSol: ctx.priceSol,
      graduationStatus: ctx.graduationStatus,
    });

    if (patternIds.length === 0) return { score: 0, signals: [], stale: false };

    const penalty = await this.patterns.learnedPenalty(patternIds);

    return {
      score: -penalty,
      signals: patternIds.map((id) => ({ name: id, value: -1, weight: penalty / patternIds.length, stale: false })),
      stale: false,
    };
  }
}

import type { AnalyserContext, AnalysisResult } from "./types.js";
import { UNKNOWN_RESULT } from "./types.js";
import { computeMoonPatternIds } from "./pattern-signals.js";
import type { LearnedPatternsStore } from "./learned-patterns-store.js";

export interface MoonAnalyser {
  analyse(ctx: AnalyserContext): Promise<AnalysisResult>;
}

/**
 * Ported from the source bot's `moonAnalyser` + `moonStore` — the
 * positive-signal side of the score (PROJECT.md Phase 1/2), backed by the
 * source bot's real accumulated data (100 labeled moons / 137 mediocre
 * exits) seeded into `learned_patterns`.
 */
export class DefaultMoonAnalyser implements MoonAnalyser {
  constructor(private readonly patterns: LearnedPatternsStore) {}

  async analyse(ctx: AnalyserContext): Promise<AnalysisResult> {
    if (ctx.stale) return UNKNOWN_RESULT;

    const patternIds = computeMoonPatternIds({
      top3HolderPct: ctx.top3HolderPct,
      liquiditySol: ctx.liquiditySol,
      priceChange5mPct: ctx.priceChange5mPct,
      volume5mUsd: ctx.volume5mUsd,
      holderCount: ctx.holderCount,
      priceSol: ctx.priceSol,
      graduationStatus: ctx.graduationStatus,
    });

    if (patternIds.length === 0) return { score: 0, signals: [], stale: false };

    const bonus = await this.patterns.moonBonus(patternIds);

    return {
      score: bonus,
      signals: patternIds.map((id) => ({ name: id, value: 1, weight: bonus / patternIds.length, stale: false })),
      stale: false,
    };
  }
}

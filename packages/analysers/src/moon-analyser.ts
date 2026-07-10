import type { AnalyserContext, AnalysisResult } from "./types.js";
import { UNKNOWN_RESULT } from "./types.js";

export interface MoonAnalyser {
  analyse(ctx: AnalyserContext): Promise<AnalysisResult>;
}

/**
 * PORT TARGET: `moonAnalyser` + `moonStore` from the source bot — the
 * positive-signal side of the score (legit-token detection: healthy holder
 * distribution growth, sustained volume, renounced authorities, LP locked/
 * burned, organic social signal, etc).
 *
 * `moonStore` held accumulated legit-signal state per token; when porting,
 * fold its persisted state into this analyser's inputs rather than keeping
 * a second bespoke store — packages/db's `tokens`/`score_events` tables are
 * the single source of truth here.
 *
 * StubMoonAnalyser is a fail-safe placeholder pending the real port.
 */
export class StubMoonAnalyser implements MoonAnalyser {
  async analyse(ctx: AnalyserContext): Promise<AnalysisResult> {
    if (ctx.priceLiquidity.stale) return UNKNOWN_RESULT;
    // TODO: port moonAnalyser + moonStore's real signal detection here.
    return UNKNOWN_RESULT;
  }
}

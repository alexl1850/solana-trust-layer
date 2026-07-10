import type { AnalyserContext, AnalysisResult } from "./types.js";
import { UNKNOWN_RESULT } from "./types.js";

export interface RugAnalyser {
  analyse(ctx: AnalyserContext): Promise<AnalysisResult>;
}

/**
 * PORT TARGET: `rugAnalyser` from the private trading bot
 * (solana-meme-bot/src/analysers/rugAnalyser or equivalent). This is the
 * core of the public risk scorer.
 *
 * Behavior to preserve when porting:
 *  - Rug pattern detection trained on `patternStore`'s labeled outcomes
 *    (LP pulls, dev wallet sell-offs, mint/freeze authority not renounced,
 *    holder concentration, etc).
 *  - The RUG_EXIT false-positive fix: when Birdeye price/liquidity data is
 *    stale, the analyser MUST degrade to UNKNOWN, never report CRITICAL.
 *    This was a real production bug in the source bot — do not regress it.
 *  - All trading/execution logic (entries, exits, position sizing) from the
 *    source module is dropped; only the detection/scoring surface is kept.
 *
 * StubRugAnalyser is a fail-safe placeholder used until the real port
 * lands: it always reports UNKNOWN rather than fabricating a score, so the
 * scoring pipeline (services/ingest) can run end-to-end today without
 * lying about confidence.
 */
export class StubRugAnalyser implements RugAnalyser {
  async analyse(ctx: AnalyserContext): Promise<AnalysisResult> {
    if (ctx.priceLiquidity.stale) return UNKNOWN_RESULT;
    // TODO: port rugAnalyser's real signal detection here.
    return UNKNOWN_RESULT;
  }
}

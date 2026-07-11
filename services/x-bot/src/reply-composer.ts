export interface ReplyContext {
  mint: string;
  score: number | null;
  riskLevel: string;
  clusterSummary: string;
  reportUrl: string;
}

const TWEET_MAX_LENGTH = 280;

/** Score, risk level, one-line cluster summary, link — per PROJECT.md Phase 5. */
export function composeReply(ctx: ReplyContext): string {
  const scoreText = ctx.score !== null ? `${ctx.score.toFixed(0)}/100` : "UNKNOWN";
  const lines = [`Score: ${scoreText} (${ctx.riskLevel.toUpperCase()})`, ctx.clusterSummary, ctx.reportUrl];
  const text = lines.join("\n");
  return text.length > TWEET_MAX_LENGTH ? text.slice(0, TWEET_MAX_LENGTH - 1) + "…" : text;
}

export function composeReceiptPost(params: {
  mint: string;
  riskLevel: string;
  minutesUntilRug: number;
  drawdownPct: number;
  reportUrl: string;
}): string {
  return [
    `Flagged ${params.riskLevel.toUpperCase()} on ${params.mint}.`,
    `Rugged ${params.minutesUntilRug} min later, ${params.drawdownPct.toFixed(0)}% drawdown.`,
    params.reportUrl,
  ].join("\n");
}

/** Compact price formatting for meme-coin-scale prices (e.g. $0.0000041) without going full scientific notation. */
function formatPrice(priceUsd: number): string {
  if (priceUsd >= 1) return `$${priceUsd.toFixed(2)}`;
  if (priceUsd >= 0.01) return `$${priceUsd.toFixed(4)}`;
  const decimals = Math.max(4, -Math.floor(Math.log10(priceUsd)) + 2);
  return `$${priceUsd.toFixed(decimals)}`;
}

export function composeWinPost(params: {
  mint: string;
  multiple: number;
  entryPriceUsd: number;
  peakPriceUsd: number;
  reportUrl: string;
}): string {
  return [
    `Called ${params.mint} LOW RISK at ${formatPrice(params.entryPriceUsd)}.`,
    `Peaked at ${formatPrice(params.peakPriceUsd)} — that's a ${params.multiple.toFixed(1)}x.`,
    `(Hypothetical: entry at call time, exit at confirmed peak. Not financial advice.)`,
    params.reportUrl,
  ].join("\n");
}

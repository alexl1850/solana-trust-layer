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

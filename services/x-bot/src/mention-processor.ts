import type { Redis } from "ioredis";
import { extractCandidateAddresses } from "./ca-regex.js";
import { shouldReply, type LastReply } from "./dedupe.js";
import { selectPrioritized } from "./reply-budget.js";
import { composeReply } from "./reply-composer.js";
import type { TrustApiClient } from "./trust-api-client.js";
import type { XClient, Mention } from "./x-client.js";

export interface MentionProcessorOptions {
  reportBaseUrl: string;
  dailyReplyBudget: number;
}

/**
 * Wires the pure decision pieces (dedupe, budget prioritization, reply
 * composition) to the live X + Trust API clients. Redis holds the only
 * mutable state: last-reply-per-mint and today's reply counter.
 */
export class MentionProcessor {
  constructor(
    private readonly redis: Redis,
    private readonly trustApi: TrustApiClient,
    private readonly xClient: XClient,
    private readonly opts: MentionProcessorOptions,
  ) {}

  async processMentions(mentions: Mention[]): Promise<void> {
    const budgetState = await this.getBudgetState();

    const perMention = await Promise.all(
      mentions.map(async (mention) => {
        const [mint] = extractCandidateAddresses(mention.text);
        return { mention, mint };
      }),
    );

    const withMint = perMention.filter(
      (m): m is { mention: Mention; mint: string } => m.mint !== undefined,
    );

    const velocityByMint = new Map<string, number>();
    for (const { mint } of withMint) velocityByMint.set(mint, (velocityByMint.get(mint) ?? 0) + 1);

    const candidates = [...velocityByMint.entries()].map(([mint, mentionVelocity]) => ({ mint, mentionVelocity }));
    const prioritized = new Set(selectPrioritized(candidates, budgetState).map((c) => c.mint));

    for (const { mention, mint } of withMint) {
      if (!prioritized.has(mint)) continue;

      try {
        await this.tryReply(mention, mint);
      } catch (err) {
        console.error(`[x-bot] failed to reply to mention ${mention.id} for ${mint}:`, err);
      }
    }
  }

  private async tryReply(mention: Mention, mint: string): Promise<void> {
    const score = await this.trustApi.getScore(mint);
    if (!score) return; // not scored yet — nothing to say

    const lastReply = await this.getLastReply(mint);
    if (!shouldReply(lastReply, score.riskLevel, new Date())) return;

    const clusterSummary = score.cluster
      ? `Deployer cluster: ${score.cluster.tokens_launched} launches, ${score.cluster.rug_count} rugs`
      : "Deployer cluster: unknown (no traceable funding history)";

    const text = composeReply({
      mint,
      score: score.score,
      riskLevel: score.riskLevel,
      clusterSummary,
      reportUrl: `${this.opts.reportBaseUrl}/?mint=${mint}`,
    });

    await this.xClient.postReply(text, mention.id);
    await this.recordReply(mint, score.riskLevel);
  }

  private async getBudgetState(): Promise<{ repliesUsedToday: number; dailyBudget: number }> {
    const dayKey = new Date().toISOString().slice(0, 10);
    const used = Number((await this.redis.get(`xbot:replies:${dayKey}`)) ?? 0);
    return { repliesUsedToday: used, dailyBudget: this.opts.dailyReplyBudget };
  }

  private async getLastReply(mint: string): Promise<LastReply | null> {
    const raw = await this.redis.get(`xbot:last-reply:${mint}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { riskLevel: string; repliedAt: string };
    return { riskLevel: parsed.riskLevel, repliedAt: new Date(parsed.repliedAt) };
  }

  private async recordReply(mint: string, riskLevel: string): Promise<void> {
    const dayKey = new Date().toISOString().slice(0, 10);
    const counterKey = `xbot:replies:${dayKey}`;
    const count = await this.redis.incr(counterKey);
    if (count === 1) await this.redis.expire(counterKey, 60 * 60 * 24 * 2);

    await this.redis.set(
      `xbot:last-reply:${mint}`,
      JSON.stringify({ riskLevel, repliedAt: new Date().toISOString() }),
      "EX",
      60 * 60 * 2,
    );
  }
}

import type { Redis } from "ioredis";
import type { BirdeyeClient } from "@solana-trust-layer/shared";
import { shouldPostReceipt, computeDrawdownPct } from "./receipts-poster.js";
import { composeReceiptPost } from "./reply-composer.js";
import type { TrustApiClient } from "./trust-api-client.js";
import type { XClient } from "./x-client.js";

const PEAK_LIQ_TTL_SECONDS = 60 * 60 * 24 * 7; // 1 week — long enough to catch a slow bleed-out
const POSTED_TTL_SECONDS = 60 * 60 * 24 * 30; // don't re-post the same rug for a month

export interface ReceiptsMonitorOptions {
  reportBaseUrl: string;
}

/**
 * PROJECT.md Phase 5: "when a token we scored HIGH/CRITICAL drops >80%
 * liquidity, post the receipt to our own timeline." This only needs
 * *posting* access to the X API — unlike mention replies (mention-processor.ts),
 * it never reads mentions/search, so it works on X's free tier. Run this
 * alone to get a public track record on X without paying for Basic access;
 * add mention replies later once there's budget for it.
 */
export class ReceiptsMonitor {
  constructor(
    private readonly redis: Redis,
    private readonly trustApi: TrustApiClient,
    private readonly birdeye: Pick<BirdeyeClient, "tokenOverview">,
    private readonly xClient: XClient,
    private readonly opts: ReceiptsMonitorOptions,
  ) {}

  async tick(): Promise<void> {
    const feed = await this.trustApi.getFeed(100);
    const candidateMints = [...new Set(feed.map((e) => e.mint))];

    for (const mint of candidateMints) {
      try {
        await this.checkMint(mint);
      } catch (err) {
        console.error(`[receipts-monitor] failed to check ${mint}:`, err);
      }
    }
  }

  private async checkMint(mint: string): Promise<void> {
    const current = await this.trustApi.getScore(mint);
    if (!current || (current.riskLevel !== "high" && current.riskLevel !== "critical")) return;

    const overview = await this.birdeye.tokenOverview(mint);
    if (overview.stale) return; // don't act on bad data

    const peakKey = `xbot:peak-liq:${mint}`;
    const firstFlaggedKey = `xbot:first-flagged:${mint}`;
    const postedKey = `xbot:receipt-posted:${mint}`;

    if (await this.redis.get(postedKey)) return;

    const storedPeak = Number((await this.redis.get(peakKey)) ?? 0);
    const peakLiquidityUsd = Math.max(storedPeak, overview.liquidityUsd);
    if (peakLiquidityUsd > storedPeak) {
      await this.redis.set(peakKey, peakLiquidityUsd.toString(), "EX", PEAK_LIQ_TTL_SECONDS);
    }

    if (!(await this.redis.get(firstFlaggedKey))) {
      await this.redis.set(firstFlaggedKey, Date.now().toString(), "EX", PEAK_LIQ_TTL_SECONDS);
    }

    const shouldPost = shouldPostReceipt({
      mint,
      riskLevel: current.riskLevel,
      peakLiquidityUsd,
      currentLiquidityUsd: overview.liquidityUsd,
      alreadyPosted: false,
    });
    if (!shouldPost) return;

    const firstFlaggedAt = Number((await this.redis.get(firstFlaggedKey)) ?? Date.now());
    const minutesUntilRug = Math.max(1, Math.round((Date.now() - firstFlaggedAt) / 60_000));
    const drawdownPct = computeDrawdownPct(peakLiquidityUsd, overview.liquidityUsd);

    const text = composeReceiptPost({
      mint,
      riskLevel: current.riskLevel,
      minutesUntilRug,
      drawdownPct,
      reportUrl: `${this.opts.reportBaseUrl}/?mint=${mint}`,
    });

    await this.xClient.postTweet(text);
    await this.redis.set(postedKey, "1", "EX", POSTED_TTL_SECONDS);
    console.log(`[receipts-monitor] posted receipt for ${mint} (${drawdownPct.toFixed(0)}% drawdown)`);
  }
}

import type { Redis } from "ioredis";
import type { BirdeyeClient } from "@solana-trust-layer/shared";
import { shouldPostWin, computeMultiple } from "./win-poster.js";
import { composeWinPost } from "./reply-composer.js";
import type { TrustApiClient } from "./trust-api-client.js";
import type { XClient } from "./x-client.js";

const PRICE_TRACKING_TTL_SECONDS = 60 * 60 * 24 * 14; // 2 weeks
const POSTED_TTL_SECONDS = 60 * 60 * 24 * 30;

export interface WinsMonitorOptions {
  reportBaseUrl: string;
}

/**
 * Mirror of ReceiptsMonitor for the win side: "we scored this LOW risk at
 * $X, it peaked at $Y before pulling back — that's an Nx." Posting-only,
 * same as receipts — no X read access needed, works on the free tier.
 */
export class WinsMonitor {
  constructor(
    private readonly redis: Redis,
    private readonly trustApi: TrustApiClient,
    private readonly birdeye: Pick<BirdeyeClient, "tokenOverview">,
    private readonly xClient: XClient,
    private readonly opts: WinsMonitorOptions,
  ) {}

  async tick(): Promise<void> {
    const feed = await this.trustApi.getFeed(100);
    const candidateMints = [...new Set(feed.map((e) => e.mint))];

    for (const mint of candidateMints) {
      try {
        await this.checkMint(mint);
      } catch (err) {
        console.error(`[wins-monitor] failed to check ${mint}:`, err);
      }
    }
  }

  private async checkMint(mint: string): Promise<void> {
    const current = await this.trustApi.getScore(mint);
    if (!current || current.riskLevel !== "low") return;

    const postedKey = `xbot:win-posted:${mint}`;
    if (await this.redis.get(postedKey)) return;

    const overview = await this.birdeye.tokenOverview(mint);
    if (overview.stale || overview.priceUsd <= 0) return;

    const entryKey = `xbot:entry-price:${mint}`;
    const peakKey = `xbot:peak-price:${mint}`;

    let entryPriceUsd = Number((await this.redis.get(entryKey)) ?? 0);
    if (entryPriceUsd <= 0) {
      entryPriceUsd = overview.priceUsd;
      await this.redis.set(entryKey, entryPriceUsd.toString(), "EX", PRICE_TRACKING_TTL_SECONDS);
    }

    const storedPeak = Number((await this.redis.get(peakKey)) ?? 0);
    const peakPriceUsd = Math.max(storedPeak, overview.priceUsd);
    if (peakPriceUsd > storedPeak) {
      await this.redis.set(peakKey, peakPriceUsd.toString(), "EX", PRICE_TRACKING_TTL_SECONDS);
    }

    const shouldPost = shouldPostWin({
      mint,
      riskLevel: current.riskLevel,
      entryPriceUsd,
      peakPriceUsd,
      currentPriceUsd: overview.priceUsd,
      alreadyPosted: false,
    });
    if (!shouldPost) return;

    const multiple = computeMultiple(entryPriceUsd, peakPriceUsd);
    const text = composeWinPost({
      mint,
      multiple,
      entryPriceUsd,
      peakPriceUsd,
      reportUrl: `${this.opts.reportBaseUrl}/?mint=${mint}`,
    });

    await this.xClient.postTweet(text);
    await this.redis.set(postedKey, "1", "EX", POSTED_TTL_SECONDS);
    console.log(`[wins-monitor] posted win for ${mint} (${multiple.toFixed(1)}x)`);
  }
}

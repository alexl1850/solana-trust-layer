import { loadConfig, getRedisClient, BirdeyeClient } from "@solana-trust-layer/shared";
import { MentionProcessor } from "./mention-processor.js";
import { ReceiptsMonitor } from "./receipts-monitor.js";
import { WinsMonitor } from "./wins-monitor.js";
import { TrustApiClient } from "./trust-api-client.js";
import { XClient } from "./x-client.js";

const MENTION_POLL_INTERVAL_MS = 60_000;
const RECEIPTS_POLL_INTERVAL_MS = 3 * 60_000;
const WINS_POLL_INTERVAL_MS = 3 * 60_000;

async function main() {
  const config = loadConfig();
  const redis = getRedisClient(config.redis.url);

  const xClient = new XClient({
    apiKey: config.xBot.apiKey,
    apiSecret: config.xBot.apiSecret,
    accessToken: config.xBot.accessToken,
    accessTokenSecret: config.xBot.accessTokenSecret,
    bearerToken: config.xBot.bearerToken,
  });

  const trustApi = new TrustApiClient(`http://localhost:${config.ports.api}`, config.xBot.bearerToken);

  // Receipts-posting only needs X write access (free-tier compatible) — always on.
  const birdeye = new BirdeyeClient(config.birdeye.apiKey, redis, config.birdeye.rateLimitRps);
  const receiptsMonitor = new ReceiptsMonitor(redis, trustApi, birdeye, xClient, {
    reportBaseUrl: config.xBot.reportBaseUrl,
  });

  const winsMonitor = new WinsMonitor(redis, trustApi, birdeye, xClient, {
    reportBaseUrl: config.xBot.reportBaseUrl,
  });

  console.log("[x-bot] receipts + wins monitors started (free-tier compatible — posting only, no mention reads)");
  const runReceiptsTick = () =>
    receiptsMonitor.tick().catch((err) => console.error("[x-bot] receipts-monitor tick failed:", err));
  const runWinsTick = () => winsMonitor.tick().catch((err) => console.error("[x-bot] wins-monitor tick failed:", err));
  await Promise.all([runReceiptsTick(), runWinsTick()]);
  setInterval(runReceiptsTick, RECEIPTS_POLL_INTERVAL_MS);
  setInterval(runWinsTick, WINS_POLL_INTERVAL_MS);

  // Mention replies need X's paid read access (Basic tier+) — opt-in via X_ENABLE_MENTION_REPLIES.
  if (!config.xBot.enableMentionReplies) {
    console.log("[x-bot] mention replies disabled (X_ENABLE_MENTION_REPLIES=false) — set it once you're on a paid X API tier");
    return;
  }

  const botUserId = process.env.X_BOT_USER_ID;
  if (!botUserId) throw new Error("X_BOT_USER_ID is required when X_ENABLE_MENTION_REPLIES=true");

  const processor = new MentionProcessor(redis, trustApi, xClient, {
    reportBaseUrl: config.xBot.reportBaseUrl,
    dailyReplyBudget: config.xBot.replyBudgetPerDay,
  });

  let sinceId: string | undefined;

  async function pollMentions() {
    try {
      const mentions = await xClient.getMentions(botUserId!, sinceId);
      if (mentions.length === 0) return;

      sinceId = mentions[0]!.id; // X returns newest-first
      await processor.processMentions(mentions);
    } catch (err) {
      console.error("[x-bot] mention poll failed:", err);
    }
  }

  console.log("[x-bot] mention replies started");
  await pollMentions();
  setInterval(pollMentions, MENTION_POLL_INTERVAL_MS);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

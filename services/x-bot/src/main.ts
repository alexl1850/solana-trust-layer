import { loadConfig, getRedisClient } from "@solana-trust-layer/shared";
import { MentionProcessor } from "./mention-processor.js";
import { TrustApiClient } from "./trust-api-client.js";
import { XClient } from "./x-client.js";

const POLL_INTERVAL_MS = 60_000;

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

  const processor = new MentionProcessor(redis, trustApi, xClient, {
    reportBaseUrl: "https://app.solanatrustlayer.com", // TODO: move to env once the domain is live
    dailyReplyBudget: config.xBot.replyBudgetPerDay,
  });

  const botUserId = process.env.X_BOT_USER_ID;
  if (!botUserId) throw new Error("X_BOT_USER_ID is required (the bot account's own user id)");

  let sinceId: string | undefined;

  async function poll() {
    try {
      const mentions = await xClient.getMentions(botUserId!, sinceId);
      if (mentions.length === 0) return;

      sinceId = mentions[0]!.id; // X returns newest-first
      await processor.processMentions(mentions);
    } catch (err) {
      console.error("[x-bot] poll failed:", err);
    }
  }

  console.log("[x-bot] started");
  await poll();
  setInterval(poll, POLL_INTERVAL_MS);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

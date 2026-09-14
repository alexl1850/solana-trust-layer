import { createClient } from "@supabase/supabase-js";
import { loadConfig, BirdeyeClient, HeliusClient, DexScreenerClient, getRedisClient } from "@solana-trust-layer/shared";
import { DefaultRugAnalyser, DefaultMoonAnalyser, LearnedPatternsStore } from "@solana-trust-layer/analysers";
import { ClusterEngine } from "@solana-trust-layer/wallet-graph";
import { ScoringPipeline } from "./pipeline.js";
import { LaunchListener } from "./launch-listener.js";
import { SafetyPoll } from "./safety-poll.js";
import { scheduleReceiptsJob } from "./receipts-job.js";
import { FomoPipeline } from "./fomo-pipeline.js";
import { MultiChainFomoScanner } from "./multichain-scanner.js";

async function main() {
  const config = loadConfig();

  const db = createClient(config.db.supabaseUrl, config.db.supabaseServiceRoleKey);
  const redis = getRedisClient(config.redis.url);
  const helius = new HeliusClient(config.helius.rpcUrl);
  const birdeye = new BirdeyeClient(config.birdeye.apiKey, redis, config.birdeye.rateLimitRps, (mint) =>
    helius.getTokenSupplyUi(mint),
  );

  const clusterEngine = new ClusterEngine(db, helius);
  const patternsStore = new LearnedPatternsStore(db);
  const rugAnalyser = new DefaultRugAnalyser(patternsStore);
  const moonAnalyser = new DefaultMoonAnalyser(patternsStore);
  const pipeline = new ScoringPipeline(db, birdeye, helius, rugAnalyser, moonAnalyser, clusterEngine);

  const listener = new LaunchListener({ wsUrl: config.helius.wsUrl }, helius, (event) => {
    pipeline.scoreNewLaunch(event).catch((err) => console.error(`[ingest] scoreNewLaunch(${event.mint}) failed:`, err));
  });
  listener.start();

  const safetyPoll = new SafetyPoll(db, pipeline);
  safetyPoll.start();

  // Multi-chain early-volume / pre-FOMO alert feature (detect-and-alert
  // only, see PROJECT.md hard rule 1). Runs alongside the Solana-only rug-
  // risk pipeline above; each EVM chain is only watched live if its WSS RPC
  // URL is configured (see .env.example).
  const dexscreener = new DexScreenerClient(redis, config.dexscreener.rateLimitRps);
  const fomoPipeline = new FomoPipeline(db, dexscreener);
  const fomoScanner = new MultiChainFomoScanner(fomoPipeline, {
    ethereum: config.evm.ethereum,
    base: config.evm.base,
    bsc: config.evm.bsc,
  });
  fomoScanner.start();

  if (config.receipts.walletPrivateKey) {
    scheduleReceiptsJob(db, {
      cronExpression: config.receipts.merkleJobCron,
      rpcUrl: config.helius.rpcUrl,
      walletSecretKey: config.receipts.walletPrivateKey,
    });
  } else {
    console.warn("[ingest] RECEIPTS_WALLET_PRIVATE_KEY not set — receipts job disabled");
  }

  console.log("[ingest] worker started");

  process.on("SIGTERM", () => {
    listener.stop();
    safetyPoll.stop();
    fomoScanner.stop();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

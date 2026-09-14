import Fastify from "fastify";
import cors from "@fastify/cors";
import { createClient } from "@supabase/supabase-js";
import { loadConfig, getRedisClient, HeliusClient } from "@solana-trust-layer/shared";
import { createAuthHook } from "./auth-context.js";
import { TierRateLimiter } from "./rate-limit.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerScoreRoutes } from "./routes/score.js";
import { registerClusterRoutes } from "./routes/cluster.js";
import { registerReceiptsRoutes } from "./routes/receipts.js";
import { registerAccountRoutes } from "./routes/account.js";
import { registerFomoRoutes } from "./routes/fomo.js";
import { scheduleBalanceRecheck } from "./balance-recheck.js";

async function main() {
  const config = loadConfig();
  const db = createClient(config.db.supabaseUrl, config.db.supabaseServiceRoleKey);
  const redis = getRedisClient(config.redis.url);
  const helius = new HeliusClient(config.helius.rpcUrl);
  const rateLimiter = new TierRateLimiter(redis);

  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });

  app.addHook("onRequest", createAuthHook(config.auth.jwtSecret));

  registerAuthRoutes(app, {
    db,
    jwtSecret: config.auth.jwtSecret,
    jwtExpiry: config.auth.jwtExpiry,
    nonceTtlSeconds: config.auth.nonceTtlSeconds,
  });
  registerScoreRoutes(app, { db, rateLimiter });
  registerClusterRoutes(app, { db });
  registerReceiptsRoutes(app, { db });
  registerAccountRoutes(app, { db });
  registerFomoRoutes(app, { db });

  app.get("/healthz", async () => ({ ok: true }));

  scheduleBalanceRecheck(db, helius, {
    tokenMint: config.token.mint,
    holderMinBalance: config.token.holderTierMinBalance,
    apiProMinBalance: config.token.apiProTierMinBalance,
    gracePeriodHours: config.token.balanceGracePeriodHours,
    intervalHours: config.token.balanceRecheckIntervalHours,
  });

  await app.listen({ port: config.ports.api, host: "0.0.0.0" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

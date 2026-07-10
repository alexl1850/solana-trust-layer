function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export function loadConfig() {
  return {
    helius: {
      apiKey: optional("HELIUS_API_KEY", ""),
      rpcUrl: optional("HELIUS_RPC_URL", ""),
      wsUrl: optional("HELIUS_WS_URL", ""),
      cluster: optional("SOLANA_CLUSTER", "devnet"),
    },
    birdeye: {
      apiKey: optional("BIRDEYE_API_KEY", ""),
      rateLimitRps: Number(optional("BIRDEYE_RATE_LIMIT_RPS", "15")),
    },
    redis: {
      url: optional("REDIS_URL", "redis://localhost:6379"),
    },
    db: {
      databaseUrl: optional("DATABASE_URL", ""),
      supabaseUrl: optional("SUPABASE_URL", ""),
      supabaseServiceRoleKey: optional("SUPABASE_SERVICE_ROLE_KEY", ""),
    },
    token: {
      mint: optional("TRUST_TOKEN_MINT", ""),
      holderTierMinBalance: BigInt(optional("HOLDER_TIER_MIN_BALANCE", "1000000")),
      apiProTierMinBalance: BigInt(optional("API_PRO_TIER_MIN_BALANCE", "10000000")),
      balanceRecheckIntervalHours: Number(optional("BALANCE_RECHECK_INTERVAL_HOURS", "8")),
      balanceGracePeriodHours: Number(optional("BALANCE_GRACE_PERIOD_HOURS", "24")),
    },
    auth: {
      jwtSecret: optional("JWT_SECRET", ""),
      jwtExpiry: optional("JWT_EXPIRY", "7d"),
      nonceTtlSeconds: Number(optional("AUTH_NONCE_TTL_SECONDS", "300")),
    },
    receipts: {
      walletPrivateKey: optional("RECEIPTS_WALLET_PRIVATE_KEY", ""),
      merkleJobCron: optional("RECEIPTS_MERKLE_JOB_CRON", "0 * * * *"),
    },
    xBot: {
      apiKey: optional("X_API_KEY", ""),
      apiSecret: optional("X_API_SECRET", ""),
      accessToken: optional("X_ACCESS_TOKEN", ""),
      accessTokenSecret: optional("X_ACCESS_TOKEN_SECRET", ""),
      bearerToken: optional("X_BEARER_TOKEN", ""),
      replyBudgetPerDay: Number(optional("X_REPLY_BUDGET_PER_DAY", "1000")),
    },
    ports: {
      api: Number(optional("API_PORT", "3000")),
      web: Number(optional("WEB_PORT", "5173")),
    },
    nodeEnv: optional("NODE_ENV", "development"),
  } as const;
}

export type Config = ReturnType<typeof loadConfig>;
export { required };

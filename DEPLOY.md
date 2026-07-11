# Getting the ingest worker running 24/7

This gets the launch-detection worker (`services/ingest`) picking up new
Solana token launches around the clock, on Railway. Follow steps 1-4 to get
API keys, then step 5 to deploy.

## 1. Supabase (database)

1. Go to https://supabase.com → Sign up → **New project**.
2. Pick a name/region, set a database password (save it).
3. Once created: **Project Settings → API** → copy:
   - `Project URL` → this is `SUPABASE_URL`
   - `service_role` secret key → this is `SUPABASE_SERVICE_ROLE_KEY`
4. **Project Settings → Database → Connection string → URI** → copy that as
   `DATABASE_URL` (used only to run migrations, not by the running app).

## 2. Helius (Solana RPC + websocket)

1. Go to https://www.helius.dev → Sign up → **Create API Key** (free tier
   works to start).
2. Copy the API key → this is `HELIUS_API_KEY`.

## 3. Birdeye (price/liquidity data)

1. Go to https://bds.birdeye.so (Birdeye Data Services) → sign up for API
   access → **Lite** plan is enough to start (15 requests/sec).
2. Copy the API key → this is `BIRDEYE_API_KEY`.

## 4. Upstash (Redis)

1. Go to https://upstash.com → Sign up → **Create Database** (Redis,
   regional, pick a region close to where you'll deploy — `us-east-1` if
   deploying to Railway's default US region).
2. Copy the **Redis connection string** (the `rediss://...` one, not the
   REST API URL) → this is `REDIS_URL`.

## What to send back

Once you have these four, send me:
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`
- `HELIUS_API_KEY`
- `BIRDEYE_API_KEY`
- `REDIS_URL`

I'll run the DB migrations against Supabase and prep everything for deploy.
(Everything else in `.env.example` — the trust token mint, Stripe, X API,
the receipts wallet — can stay blank for now; the ingest worker runs fine
without them, it just logs a warning that the receipts/Merkle job is
disabled until a receipts wallet is set.)

## 5. Deploy to Railway (always-on worker)

1. Go to https://railway.app → Sign up with GitHub.
2. **New Project → Deploy from GitHub repo** → pick `alexl1850/solana-trust-layer`.
3. Once the service is created, go to its **Settings**:
   - **Root Directory**: `/` (leave as repo root — the pnpm workspace needs
     root context to install).
   - **Config-as-code path**: `deploy/railway.ingest.json` (this repo
     already has this file — it sets the build/start commands and an
     auto-restart-on-crash policy).
4. **Variables** tab → add every var from `.env.example` that has a value
   (the six above, plus `SOLANA_CLUSTER=mainnet-beta` once you're ready to
   watch real launches instead of devnet).
5. Deploy. Railway keeps it running continuously and restarts it
   automatically on crash (`restartPolicyMaxRetries: 10` in the config)
   — that's the "24/7, picks up its own CA" part: `services/ingest` holds a
   persistent Helius websocket subscription to pump.fun/PumpSwap/Raydium
   program logs and scores every new launch as it's detected, no polling,
   no manual restart needed.

`services/api` and `services/x-bot` deploy the same way later (their own
`deploy/railway.api.json` / `deploy/railway.xbot.json` already exist) — one
Railway service per repo, each pointed at its own config-as-code path.

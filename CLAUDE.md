# Solana Trust Layer

Real-time rug risk & deployer reputation platform for Solana. Full product
spec, architecture, phases, and hard rules live in `PROJECT.md` — read that
first, it's the source of truth for what this repo is building and why.

## Repo layout

pnpm workspace monorepo:

```
packages/
  db/           Supabase Postgres schema (migrations/), typed client, shared types
  shared/       config loader, Helius client, Birdeye client (rate-limited + cached), Redis
  wallet-graph/ the moat: wallet clustering (union-find, funding walk, cluster reputation)
  analysers/    ported rug/moon pattern analysers, backed by the source bot's real trained data
services/
  ingest/       long-running worker: Helius launch discovery, WEIGHTS-based scorer, safety poll, receipts job, backtest
  api/          Fastify public API: wallet-connect auth, tiers, rate limits, score/cluster/receipts endpoints
  web/          React + Vite frontend (Vercel), dark terminal aesthetic
  x-bot/        X mention listener + reply bot
```

## Porting status

Ported from the source trading bot (`solana-meme-bot`) and real, not stubbed:

- `packages/analysers`: `rugAnalyser`/`moonAnalyser` pattern-signal
  extraction (`pattern-signals.ts`) + learned-weight lookups
  (`learned-patterns-store.ts`), backed by the `learned_patterns` table
  seeded from the source bot's real accumulated data (87 labeled rugs, 100
  labeled moons — see `packages/db/migrations/0004_seed_learned_patterns.sql`).
- `services/ingest`: the full WEIGHTS-based scorer (`breakdown.ts`,
  ported from `scoring.ts`), Helius websocket launch discovery
  (`launch-listener.ts`, ported from `discovery.ts` — pump.fun/PumpSwap/
  Raydium program-log detection), the pump.fun bonding-curve reader
  (`graduation.ts`), and volume-divergence detection (`volume-divergence.ts`).

**Not ported:** the source's `devWalletTracker` blacklist (`dev-wallets.json`,
~60 entries) has a real bug — `rugAnalyser.ts` calls
`recordDevRug(pos.mint, pos.mint)`, so every tracked "wallet" is actually a
token mint (the source's `Position` type never captured a deployer wallet at
all). See the comment at the top of `packages/analysers/src/dev-wallet-tracker.ts`.
`packages/wallet-graph`'s cluster-reputation engine replaces this feature
properly — it derives the real deployer wallet from the launch transaction.

Everything else (DB schema, wallet clustering, scoring pipeline wiring, API,
web app, X bot) is original code built for this product, with unit test
coverage for its core logic.

## Working in this repo

- `pnpm install` at the root installs all workspaces.
- Build a package before packages that depend on it can typecheck (workspace
  packages resolve types from `dist/`, not `src/` directly):
  `pnpm --filter @solana-trust-layer/<pkg> build`
- `pnpm -r build`, `pnpm -r typecheck`, `pnpm -r test` run across every
  workspace.
- Per-service dev: `pnpm dev:ingest`, `pnpm dev:api`, `pnpm dev:web`,
  `pnpm dev:x-bot` (see root `package.json`).
- DB migrations: `pnpm --filter @solana-trust-layer/db migrate` (needs
  `DATABASE_URL` set — see `.env.example`).
- Copy `.env.example` to `.env` and fill in real values before running
  anything against live Helius/Birdeye/Supabase/X.

## Hard rules (from PROJECT.md — do not violate)

1. No trading/execution code anywhere in this repo — this is a scoring
   product, not a trading bot.
2. Stale upstream data (Birdeye, etc.) degrades to `UNKNOWN`, never
   `CRITICAL`. This was a real production bug in the source bot
   (`RUG_EXIT` false positives) — don't regress it.
3. Every public score must be reproducible from `score_events` + the hourly
   Merkle receipts.
4. Never expose Helius/Birdeye keys client-side — all chain reads go through
   `services/api`.
5. Wallet clustering funding-history walks are expensive — always
   async/queued (`services/ingest`), never inline in an API request handler.

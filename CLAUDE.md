# Solana Trust Layer

Real-time rug risk & deployer reputation platform for Solana. Full product
spec, architecture, phases, and hard rules live in `PROJECT.md` — read that
first, it's the source of truth for what this repo is building and why.

## Repo layout

pnpm workspace monorepo:

```
packages/
  db/           Supabase Postgres schema (migrations/), typed client, shared types
  shared/       config loader, Helius client, Birdeye client (rate-limited + cached), DexScreener client, EVM pair listener, Redis
  wallet-graph/ the moat: wallet clustering (union-find, funding walk, cluster reputation)
  analysers/    ported rug/moon pattern analysers (real trained data) + fomo-signals.ts (new multi-chain heuristic, not backed by labeled data)
services/
  ingest/       long-running worker: Helius launch discovery, WEIGHTS-based scorer, safety poll, receipts job, backtest, multi-chain fomo scanner
  api/          Fastify public API: wallet-connect auth, tiers, rate limits, score/cluster/receipts/fomo-feed endpoints
  web/          React + Vite frontend (Vercel), dark terminal aesthetic
  x-bot/        X mention listener + reply bot
```

### Multi-chain early-volume / pre-FOMO alerts

Widened scope alongside Solana rug-risk scoring: detects meme coins showing
early volume acceleration on Solana, Ethereum, Base, and BSC before a broad
FOMO wave, and writes alerts to a separate `fomo_events` table (see
`packages/analysers/src/fomo-signals.ts`, `services/ingest/src/fomo-
breakdown.ts` + `fomo-divergence.ts` + `fomo-pipeline.ts` +
`multichain-scanner.ts`, `packages/shared/src/dexscreener-client.ts` +
`evm-client.ts`, and `GET /v1/fomo/feed`). **Detect-and-alert only** — hard
rule 1 below applies to this feature in full, same as everything else in
the repo. The `fomo_score` is a new, untested heuristic (no historical
labeled dataset backs it, unlike `rugAnalyser`/`moonAnalyser`) — treat it
as a candidate filter to backtest, never as a predicted or guaranteed
return. EVM factory addresses in `config.ts` are well-known deployment
constants but are env-overridable — verify them against each protocol's
official docs before production use.

**Rug detection is integrated** (`fomo_events.rug_risk_level`,
`signals.rugRisk` — see `fomo-pipeline.ts`): for Solana, the pipeline reads
the latest `score_events` row for the mint (the REAL trained
`rugAnalyser`/`moonAnalyser` output, already written by the existing
`ScoringPipeline` — nothing is re-implemented) and folds its risk level
into the fomo score and `rug_risk_level`. Ethereum/Base/BSC only get
`fomo-divergence.ts`'s chain-agnostic distribution/panic_dump heuristic (no
holder/dev-wallet data source exists for those chains). Market cap below
**$100k** (`MIN_MARKET_CAP_USD`, `fomo-breakdown.ts`) is always at least a
`medium` rug-risk flag, never "room to run" — the API's `/v1/fomo/feed`
supports `?maxRugRisk=` to filter by this.

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
   product, not a trading bot. This includes the multi-chain early-volume/
   pre-FOMO alert feature: detect-and-alert only, never an order placer or
   wallet/exchange-key holder.
2. Stale upstream data (Birdeye, etc.) degrades to `UNKNOWN`, never
   `CRITICAL`. This was a real production bug in the source bot
   (`RUG_EXIT` false positives) — don't regress it.
3. Every public score must be reproducible from `score_events` + the hourly
   Merkle receipts.
4. Never expose Helius/Birdeye keys client-side — all chain reads go through
   `services/api`.
5. Wallet clustering funding-history walks are expensive — always
   async/queued (`services/ingest`), never inline in an API request handler.

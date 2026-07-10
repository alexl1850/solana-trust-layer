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
  analysers/    ported rug/moon analysers — currently STUBS, see "Porting status" below
services/
  ingest/       long-running worker: launch detection, scoring pipeline, safety poll, receipts job, backtest
  api/          Fastify public API: wallet-connect auth, tiers, rate limits, score/cluster/receipts endpoints
  web/          React + Vite frontend (Vercel), dark terminal aesthetic
  x-bot/        X mention listener + reply bot
```

## Porting status

`packages/analysers` (`RugAnalyser`, `MoonAnalyser`) are **stubs** — they
always return `UNKNOWN` rather than fabricating a score. The real detection
logic needs to be ported from the private trading bot's source
(`solana-meme-bot`), which was not available in the environment this scaffold
was built in. See the `PORT TARGET` comments at the top of each file in
`packages/analysers/src/` for the exact contract to implement, and
`PROJECT.md`'s Phase 1/2 for the source-module → destination mapping.

Everything else (DB schema, wallet clustering, scoring pipeline wiring, API,
web app, X bot) is real, working code — not stubs — and has unit test
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

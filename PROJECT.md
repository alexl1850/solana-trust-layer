# Solana Trust Layer — Real-Time Rug Risk & Deployer Reputation Platform

## What we're building

A public trust/reputation layer for Solana. It scores every new token launch in
real time, traces deployers back through wallet-funding history to expose
serial ruggers, and publishes scores via a web app, a paid API, and an X reply
bot.

Access is token-gated: hold ≥1,000,000 of our token = full access free;
otherwise a paid subscription.

**We are NOT building a trading bot.** We are converting an existing private
trading bot's analysis engine into a public scoring product.

### Multi-chain early-volume / pre-FOMO alerts

Alongside Solana rug-risk scoring, the platform also surfaces meme coins
showing early volume acceleration — on Solana, Ethereum, Base, and BSC —
before they hit broad FOMO buying (see `packages/analysers/src/fomo-
signals.ts`, `services/ingest/src/fomo-breakdown.ts`, `multichain-
scanner.ts`, and the `GET /v1/fomo/feed` API route). This is **detect-and-
alert only**, same as the rug-risk score: it never places an order or holds
a wallet/exchange key (hard rule 1 still applies in full — see below). The
resulting `fomo_score` is a heuristic pattern-match against an early-
momentum shape, not a predicted or guaranteed return; unlike `rugAnalyser`/
`moonAnalyser`, it has no historical labeled dataset behind it yet and
should be treated as a candidate filter to backtest, not a finished model.

**Rug detection is integrated into every alert** (`fomo_events.rug_risk_
level` + `signals.rugRisk`, see `services/ingest/src/fomo-pipeline.ts`):
for Solana, the pipeline reads the token's latest `score_events` row —
i.e. the REAL trained `rugAnalyser`/`moonAnalyser` output, not a new model —
and folds its risk level into both the fomo score (heavy penalty on
high/critical) and the alert's `rug_risk_level`. Ethereum/Base/BSC have no
holder-distribution or dev-wallet-cluster data source yet, so they get only
`fomo-divergence.ts`'s chain-agnostic distribution/panic_dump heuristic
(mirrors `volume-divergence.ts`, rescaled for 5m/1h windows). A market cap
under **$100k** (`MIN_MARKET_CAP_USD` in `fomo-breakdown.ts`) is always
treated as an additional rug-risk flag (at least `medium`) rather than
"room to run" — that thin a float is the easiest to move with one wallet
and the easiest to rug outright.

## Source codebase being ported

Source: `solana-meme-bot` (TypeScript/Node.js), a private trading bot.

Modules ported into this service (all trading/execution code — Jupiter swaps,
position management, entries/exits — is stripped and NOT included):

| Source module | Becomes |
|---|---|
| `rugAnalyser` | Core of the risk scorer (rug pattern detection, trained on labeled outcomes) |
| `moonAnalyser` + `moonStore` | Positive-signal side of the score (legit-token detection) |
| `patternStore` | Training + backtest data (labeled rugs/moons) |
| `devWalletTracker` + dev wallet blacklist | Seed data for the deployer reputation graph |
| Helius websocket discovery | New token launch detection feed |
| Volume divergence detector | Live score updates |
| LP monitoring logic | Live score updates |
| Birdeye price/liquidity layer | Kept, but rate-limited (Birdeye Lite = 15 RPS) behind a global limiter + cache so public traffic never hits Birdeye directly |

> **Status:** ported. `rugAnalyser`/`moonAnalyser` (pattern-signal extraction +
> learned weights), `patternStore`/`moonStore` (seeded with the source bot's
> real 87-labeled-rug / 100-labeled-moon dataset), the Helius websocket
> discovery feed, volume divergence detection, and the pump.fun bonding-curve
> reader are all real, working ports — see `packages/analysers` and
> `services/ingest`. One exception: `devWalletTracker`'s blacklist data
> (`dev-wallets.json`) was **not** ported — the source has a bug
> (`rugAnalyser.ts` calls `recordDevRug(pos.mint, pos.mint)`, since `Position`
> never captured a deployer wallet at all), so every tracked "wallet" in that
> dataset is actually a token mint. `packages/wallet-graph`'s cluster-reputation
> engine replaces that feature properly, since it derives the real deployer
> wallet from the launch transaction itself.

## Tech stack

- **Backend:** Node.js + TypeScript, Fastify. Deployed initially as a single
  service; the long-running websocket listener runs as a separate
  process/worker (`services/ingest`).
- **DB:** Supabase Postgres. Wallet graph modeled in Postgres using recursive
  CTEs to start — **do NOT add Neo4j in MVP**.
- **Cache/queue:** Redis (Upstash free tier is fine for MVP).
- **Frontend:** React + Vite, deployed on Vercel.
- **External APIs:** Helius (websocket + RPC + wallet balance checks), Birdeye
  (price/liquidity).
- **X bot:** X API Basic tier ($200/mo) — built with strict rate-limit
  budgeting from day one.

## Architecture

One monorepo, four deployable services, two shared packages backing them:

```
solana-trust-layer/
├── services/
│   ├── ingest/     # Helius websocket listener + scoring pipeline worker (long-running process)
│   ├── api/         # Fastify public API, token-gated auth, tiers
│   ├── web/         # React + Vite frontend (Vercel)
│   └── x-bot/        # X mention listener + reply bot
├── packages/
│   ├── db/          # Supabase schema, migrations, typed client
│   ├── shared/       # config, Helius client, Birdeye client, DexScreener client, EVM pair listener (rate-limited + cached)
│   ├── wallet-graph/ # clustering engine (union-find, funding walk, cluster reputation)
│   └── analysers/    # ported rugAnalyser / moonAnalyser / moonStore / patternStore + new multi-chain fomo-signals heuristic
```

---

## Phase 1 — Wallet Clustering / Deployer Reputation Graph (build first)

**This is the moat.** Given a token's deployer wallet, answer: *who funded
this wallet, what other wallets did those funders fund, and what tokens did
that cluster launch, and how did those tokens end?*

### Data model (Postgres)

See `packages/db/migrations` — tables: `wallets`, `wallet_funding_edges`,
`clusters`, `tokens`, `token_launches`.

### Clustering logic

1. On every new token launch (from ingest), take the deployer wallet.
2. Walk funding history back up to **3 hops** via Helius
   (`getSignaturesForAddress` + parsed transfers). Only follow SOL/wSOL
   transfers **above 0.05 SOL** (dust filter).
3. Stop conditions: known CEX hot wallets (hardcoded + growing list —
   Binance, Coinbase, OKX, Bybit deposit/withdrawal wallets), bridges,
   wallets with >10k transactions (infrastructure, not individuals).
4. Union-find: if any wallet in the walk already belongs to a cluster, merge
   into it; otherwise create a new cluster.
5. Cluster reputation score = function of `(rug_count, moon_count,
   tokens_launched, recency-weighted)`. Serial-rugger cluster = score near 0.
   A fresh wallet with no traceable history = `UNKNOWN` flag (this itself is
   a risk signal — flag it, don't fake a number).

Seed the graph by backfilling from `devWalletTracker`'s blacklist and
`patternStore`'s labeled rug history.

### Acceptance criteria

- Given a fresh deployer wallet funded by a wallet that previously funded 3
  rugged launches, the system links them to the same cluster and surfaces
  "cluster has 3 prior rugs" within 30 seconds of launch detection.
- Backtest: run against `patternStore`'s historical labeled rugs; report what
  % of rugs came from clusters with ≥1 prior rug (this becomes the launch
  marketing stat).

---

## Phase 2 — Scoring Service (MEMEBOT refactor)

Wrap the ported analysers in a scoring pipeline (`services/ingest`):

- Scores recompute on events (dev wallet movement, LP change, volume
  divergence trigger), not on a fixed poll, plus a **60s safety poll** for
  tokens with active watchers.
- Every score emission is written to `score_events` with a timestamp — this
  is the provable receipts log.
- **Receipts hashing:** hourly job takes all `score_events` from the hour,
  builds a Merkle root, posts it as a memo transaction on Solana from a
  project wallet. Store the tx signature. This proves any historical score
  wasn't backdated.
- Keep the analysers' Birdeye-staleness handling from MEMEBOT (the
  `RUG_EXIT` false-positive fix): **stale upstream data must degrade to
  `UNKNOWN`, never `CRITICAL`.**

---

## Phase 3 — Public API + Token-Gated Auth

### Auth flow

1. User connects wallet on the web app (wallet-adapter), signs a nonce
   message → we verify the signature → issue JWT + API key.
2. On issue, and every 8 hours, the backend checks the token balance of that
   wallet via Helius `getTokenAccountsByOwner` for our mint.

### Tiers

| Tier | Requirement | Access |
|---|---|---|
| `free` | default | 3 score lookups/day, basic score only (no cluster detail) |
| `paid` | Stripe (crypto payments phase 2) | Full access |
| `holder` | balance ≥ 1,000,000 tokens | Full access + API, free |
| `api_pro` | balance ≥ 10,000,000 tokens OR enterprise contract | Higher rate limits |

If balance drops below threshold at re-check: **24h grace period** with a
warning email/notification, then downgrade to `free`. Do NOT hard-cut
instantly (price volatility / wallet migration UX).

Token mint address is a config env var (`TRUST_TOKEN_MINT`) — the token
doesn't exist yet; everything is built against a devnet dummy mint.

### Endpoints (see `services/api`)

- `GET /v1/score/:mint` — current score + risk level
- `GET /v1/score/:mint/history` — score-over-time
- `GET /v1/cluster/:deployerWallet` — cluster reputation detail
- `GET /v1/receipts` — public receipts feed
- `GET /v1/receipts/:merkleRoot` — proof lookup
- `POST /v1/auth/nonce`, `POST /v1/auth/verify` — wallet-connect auth
- `GET /v1/account` — tier status, usage

Rate limits per tier enforced in Redis. All responses cached 10s minimum.

---

## Phase 4 — Web App

React/Vite, Vercel. Pages:

- **Home / search** — paste a CA, get the score card: big score number, risk
  level color, cluster history ("this deployer's cluster: 4 launches, 3
  rugs"), live signal feed, score-over-time sparkline.
- **Live feed** — new launches streaming in with scores, sortable — the
  "watch the firehose" page traders keep open.
- **Receipts** — public wall of flagged-before-rug wins, auto-generated:
  "Flagged HIGH at {time}, rugged {N} min later, -{X}%" with on-chain proof
  link.
- **Account** — wallet connect, tier status, API key management,
  upgrade/subscribe.
- **Docs** — API documentation.

Dark theme, terminal aesthetic (this audience lives in Photon/BullX — match
that energy, not corporate SaaS). Mobile-first responsive.

---

## Phase 5 — X Bot

Split into two independently-toggleable pieces, because they have very
different X API cost profiles:

**Posting only (works on X's free tier — on by default):**
- Auto-post receipts: when a token scored HIGH/CRITICAL drops >80%
  liquidity, post the receipt to our own timeline with the timestamp proof
  link (`receipts-monitor.ts`).
- Auto-post wins: when a token scored LOW risk peaks at a confirmed
  multiple (peak followed by a real pullback, so we're not claiming a top
  nobody could have called) — "Called X at $Y, peaked at $Z, that's an Nx"
  (`wins-monitor.ts`). Hypothetical entry (price at the moment we called it
  low-risk) vs confirmed peak — not a simulated trade with position sizing
  or execution timing, just a transparent readout of two prices.

**Mention replies (needs X's paid read access, Basic tier+ — opt-in via
`X_ENABLE_MENTION_REPLIES`, off by default to avoid the $200+/mo cost until
there's revenue to justify it):**
- Listen for mentions containing a Solana CA (base58 regex + on-chain
  validation).
- Reply with: score, risk level, one-line cluster summary, link to full
  report on web.
- Rate-limit budget: X Basic tier caps. Maintain a reply-budget counter; if
  nearing cap, prioritize replies on tokens with high mention velocity.
- Dedupe: one reply per token per hour max, unless score changes risk level.

All bot-issued content is derived straight from `score_events` / live
Birdeye prices — nothing here is logged as a NEW score, so it's already
covered by the existing Merkle receipts on the score data itself.

---

## Build order & milestones

- **M1** — Monorepo scaffold, DB schema, ingest service listening to
  launches, ported analysers scoring in a loop (no API yet). Backtest report
  generated.
- **M2** — Wallet clustering live, cluster reputation scores computing,
  seeded from blacklist history.
- **M3** — API with tiers (dummy devnet mint for holder gate), receipts
  Merkle job.
- **M4** — Web app.
- **M5** — X bot.

## Hard rules

1. **No trading/execution code anywhere in this repo.** This includes the
   multi-chain early-volume/pre-FOMO alert feature — it detects and alerts
   only (`fomo_events` rows, an API feed), it must never place an order,
   hold a wallet/exchange key, or auto-execute anything.
2. Stale upstream data → `UNKNOWN`, never `CRITICAL` (learned from MEMEBOT's
   `RUG_EXIT` false positives).
3. Every public score must be reproducible from `score_events` + receipts.
4. Never expose Helius/Birdeye keys client-side; all chain reads proxied
   through our API.
5. Wallet clustering walks are expensive — always async/queued, never inline
   in a request handler.

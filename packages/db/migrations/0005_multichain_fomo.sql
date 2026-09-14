-- Multi-chain early-volume / pre-FOMO alerting (detect-and-alert only — no
-- trading/execution code, per PROJECT.md hard rule 1). Widens coverage from
-- Solana-only rug-risk scoring to also surface early-volume-acceleration
-- candidates across EVM chains.

-- `chain` on the existing Solana-only tables, default-backfilled so every
-- pre-existing row is explicitly tagged 'solana' rather than left ambiguous.
alter table tokens add column if not exists chain text not null default 'solana'
  check (chain in ('solana', 'ethereum', 'base', 'bsc'));
alter table score_events add column if not exists chain text not null default 'solana'
  check (chain in ('solana', 'ethereum', 'base', 'bsc'));

create index if not exists idx_tokens_chain on tokens (chain);
create index if not exists idx_score_events_chain_created_at on score_events (chain, created_at desc);

-- ── Early-volume / pre-FOMO candidates ──────────────────────────────────
-- Deliberately a separate table from score_events: this is a momentum/
-- opportunity heuristic, not a risk score, so it does not reuse
-- score_events.risk_level (unknown/low/medium/high/critical describes
-- danger, not opportunity strength — overloading it would be misleading).
-- Still follows hard rule 3: every public alert must be reproducible from
-- the stored row (signals jsonb carries the full breakdown + pattern ids).
create table if not exists fomo_events (
  id uuid primary key default gen_random_uuid(),
  chain text not null check (chain in ('solana', 'ethereum', 'base', 'bsc')),
  token_address text not null,
  pair_address text not null,
  dex_id text,
  symbol text,
  name text,
  -- null = UNKNOWN (upstream data unusable/stale — never fabricated), 0-100 otherwise.
  -- This is a heuristic pattern-match score, not a predicted or guaranteed return.
  fomo_score numeric(5,2),
  signals jsonb not null default '{}'::jsonb,
  pair_created_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_fomo_events_chain_created on fomo_events (chain, created_at desc);
create index if not exists idx_fomo_events_token on fomo_events (chain, token_address, created_at desc);
create unique index if not exists idx_fomo_events_dedup on fomo_events (chain, pair_address, created_at);

-- Solana Trust Layer — initial schema
-- Postgres (Supabase). Wallet graph modeled via recursive CTEs (no Neo4j in MVP).

create extension if not exists pgcrypto;

-- ── Wallets & clustering ──────────────────────────────────────────────

create table if not exists wallets (
  address text primary key,
  first_seen_at timestamptz not null default now(),
  tx_count bigint not null default 0,
  is_cex boolean not null default false,
  is_bridge boolean not null default false,
  is_infrastructure boolean not null default false, -- tx_count > 10k, treated as non-individual
  label text, -- e.g. 'Binance Hot Wallet 4'
  cluster_id uuid references clusters (id),
  updated_at timestamptz not null default now()
);

create table if not exists clusters (
  id uuid primary key default gen_random_uuid(),
  rug_count int not null default 0,
  moon_count int not null default 0,
  tokens_launched int not null default 0,
  reputation_score numeric(5,2), -- null = UNKNOWN (untraceable), 0-100 otherwise
  last_launch_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table wallets
  add constraint wallets_cluster_id_fkey foreign key (cluster_id) references clusters (id)
  deferrable initially deferred;

-- Directed SOL/wSOL funding edges discovered while walking a deployer's funding history.
-- from_wallet funded to_wallet. Dust filter (>0.05 SOL) applied at write time.
create table if not exists wallet_funding_edges (
  id uuid primary key default gen_random_uuid(),
  from_wallet text not null references wallets (address),
  to_wallet text not null references wallets (address),
  amount_lamports bigint not null,
  signature text not null,
  slot bigint not null,
  block_time timestamptz not null,
  hop int not null, -- 0 = direct funder of the deployer, up to 3
  discovered_at timestamptz not null default now(),
  unique (signature, from_wallet, to_wallet)
);

create index if not exists idx_funding_edges_to_wallet on wallet_funding_edges (to_wallet);
create index if not exists idx_funding_edges_from_wallet on wallet_funding_edges (from_wallet);

-- Known CEX / bridge stop-list, seeded + growing.
create table if not exists known_infrastructure_wallets (
  address text primary key,
  kind text not null check (kind in ('cex', 'bridge', 'infrastructure')),
  label text not null,
  created_at timestamptz not null default now()
);

-- ── Tokens & launches ─────────────────────────────────────────────────

create table if not exists tokens (
  mint text primary key,
  deployer_wallet text not null references wallets (address),
  name text,
  symbol text,
  launched_at timestamptz not null default now(),
  outcome text check (outcome in ('rug', 'moon', 'unresolved')) default 'unresolved',
  outcome_resolved_at timestamptz,
  outcome_details jsonb -- e.g. { "drawdown_pct": 94, "detected_by": "lp_pull" }
);

create index if not exists idx_tokens_deployer on tokens (deployer_wallet);
create index if not exists idx_tokens_outcome on tokens (outcome);

-- ── Scoring: the provable receipts log ────────────────────────────────

create table if not exists score_events (
  id uuid primary key default gen_random_uuid(),
  mint text not null references tokens (mint),
  score numeric(5,2), -- null = UNKNOWN
  risk_level text not null check (risk_level in ('unknown', 'low', 'medium', 'high', 'critical')),
  trigger text not null, -- 'launch' | 'dev_wallet_movement' | 'lp_change' | 'volume_divergence' | 'safety_poll'
  signals jsonb not null default '{}'::jsonb, -- raw analyser outputs feeding this score
  cluster_id uuid references clusters (id),
  created_at timestamptz not null default now()
);

create index if not exists idx_score_events_mint on score_events (mint, created_at desc);
create index if not exists idx_score_events_created_at on score_events (created_at);

-- Hourly Merkle roots over score_events, anchored on-chain via memo tx.
create table if not exists receipts (
  id uuid primary key default gen_random_uuid(),
  period_start timestamptz not null,
  period_end timestamptz not null,
  merkle_root text not null unique,
  event_count int not null,
  solana_tx_signature text,
  anchored_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_receipts_period on receipts (period_start, period_end);

-- ── Auth & tiers ──────────────────────────────────────────────────────

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null unique,
  tier text not null check (tier in ('free', 'paid', 'holder', 'api_pro')) default 'free',
  token_balance bigint not null default 0,
  balance_checked_at timestamptz,
  grace_period_started_at timestamptz, -- set when balance drops below threshold; null once cleared or downgraded
  stripe_customer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  key_hash text not null unique,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table if not exists auth_nonces (
  wallet_address text primary key,
  nonce text not null,
  expires_at timestamptz not null
);

create index if not exists idx_api_keys_user on api_keys (user_id);

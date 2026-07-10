-- Learned pattern-weight store, ported from the source bot's patternStore.ts
-- / moonStore.ts. Each row is a categorical signal ("top3_holders_above_50pct")
-- and how often it preceded a rug vs. a moon historically. weight = the
-- occurrence rate once >=5 observations exist (see packages/analysers).

create table if not exists learned_patterns (
  id text not null,
  kind text not null check (kind in ('rug', 'moon')),
  description text not null,
  -- rug_count for kind='rug', moon_count for kind='moon'
  positive_count int not null default 0,
  -- clean_count for kind='rug', mediocre_count for kind='moon'
  negative_count int not null default 0,
  weight numeric(8,6) not null default 0,
  last_seen timestamptz not null default now(),
  primary key (id, kind)
);

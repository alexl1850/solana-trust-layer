-- Recursive CTE helper: walk a wallet's funding history up to 3 hops back,
-- stopping at known CEX/bridge/infrastructure wallets. Mirrors the walk the
-- ingest worker performs live via Helius, and is used for re-deriving/
-- auditing clusters directly from stored edges (packages/wallet-graph calls
-- this via packages/db's typed client).

create or replace function funding_ancestors(start_wallet text, max_hops int default 3)
returns table (
  wallet text,
  hop int,
  path text[]
) language sql stable as $$
  with recursive walk (wallet, hop, path, stopped) as (
    select start_wallet, 0, array[start_wallet], false

    union all

    select
      e.from_wallet,
      walk.hop + 1,
      walk.path || e.from_wallet,
      coalesce(w.is_cex or w.is_bridge or w.is_infrastructure, false)
    from walk
    join wallet_funding_edges e on e.to_wallet = walk.wallet
    left join wallets w on w.address = e.from_wallet
    where walk.hop < max_hops
      and not walk.stopped
      and not (e.from_wallet = any(walk.path)) -- cycle guard
  )
  select wallet, hop, path from walk where wallet != start_wallet;
$$;

comment on function funding_ancestors is
  'Recursive funding-history walk used to (re)derive wallet clusters. Stops at CEX/bridge/infrastructure wallets and at max_hops (default 3), matching the Phase 1 clustering rules in PROJECT.md.';

-- Integrates rug-risk detection into the multi-chain early-volume alert
-- feature: for Solana, the real trained rugAnalyser/moonAnalyser output
-- (already computed by the existing ScoringPipeline into score_events) is
-- folded in; for Ethereum/Base/BSC, the chain-agnostic distribution/
-- panic_dump divergence heuristic (fomo-divergence.ts) is the only signal
-- available (no holder-distribution or dev-wallet-cluster data source
-- exists for those chains yet). See services/ingest/src/fomo-pipeline.ts.

alter table fomo_events add column if not exists rug_risk_level text
  check (rug_risk_level in ('unknown', 'low', 'medium', 'high', 'critical'));

create index if not exists idx_fomo_events_chain_rug_risk on fomo_events (chain, rug_risk_level);

/**
 * Pure pattern-signal extraction for the multi-chain (Solana + Ethereum/
 * Base/BSC) early-volume / pre-FOMO alert feature.
 *
 * Unlike pattern-signals.ts's rug/moon buckets — backed by the source bot's
 * real accumulated labeled outcomes (87 rugs, 100 moons, see
 * learned-patterns-store.ts) — these buckets are a NEW heuristic with no
 * historical labeled dataset behind them. They encode a hypothesis ("early
 * volume acceleration + buy pressure + room to run tends to precede a
 * broader FOMO wave"), not a proven pattern, and there is no learned-weight
 * lookup for them (no `learned_patterns` rows exist for a "fomo" kind).
 *
 * Treat the fomo score built from these ids (services/ingest/fomo-
 * breakdown.ts) as a candidate filter worth backtesting, never as a
 * probability or guaranteed-return signal. This system detects and alerts
 * only — it never places a trade (see PROJECT.md hard rule 1).
 */
export interface FomoMetrics {
  liquidityUsd: number;
  volume5mUsd: number;
  volume1hUsd: number;
  priceChange5mPct: number;
  priceChange1hPct: number;
  buys5m: number;
  sells5m: number;
  pairAgeMinutes: number;
  marketCapUsd: number;
}

export function computeFomoPatternIds(m: FomoMetrics): string[] {
  const patterns: string[] = [];

  // Freshness — this feature exists to catch coins before a broad FOMO
  // wave, so a younger pair scores as more "pre-FOMO".
  if (m.pairAgeMinutes < 15) patterns.push("pair_age_under_15min");
  else if (m.pairAgeMinutes < 60) patterns.push("pair_age_under_60min");
  else if (m.pairAgeMinutes < 120) patterns.push("pair_age_under_120min");

  // Volume acceleration — is the last 5 minutes running hotter than the
  // hourly average would predict?
  const hourlyRatePerFiveMin = m.volume1hUsd / 12;
  const volRatio =
    hourlyRatePerFiveMin > 0 ? m.volume5mUsd / hourlyRatePerFiveMin : m.volume5mUsd > 0 ? Infinity : 0;
  if (volRatio > 4) patterns.push("volume_accel_5m_gt_4x_hourly_rate");
  else if (volRatio > 2) patterns.push("volume_accel_5m_gt_2x_hourly_rate");

  // Buy pressure — require a minimum sample size so 2 buys / 0 sells
  // doesn't register as a strong signal.
  const totalTxns5m = m.buys5m + m.sells5m;
  const buyRatio = totalTxns5m > 0 ? m.buys5m / totalTxns5m : 0;
  if (totalTxns5m >= 5 && buyRatio > 0.8) patterns.push("buy_pressure_above_80pct");
  else if (totalTxns5m >= 5 && buyRatio > 0.65) patterns.push("buy_pressure_above_65pct");

  // Liquidity — enough depth to trade without extreme slippage, not yet a
  // deep/mature pool (which would mean the early window already passed).
  if (m.liquidityUsd >= 5_000 && m.liquidityUsd <= 150_000) patterns.push("liquidity_early_sweet_spot");
  if (m.liquidityUsd < 3_000) patterns.push("liquidity_below_3k_illiquid");

  // Price action — some upward move already (confirms real buying, not a
  // dead pair), but not so far up that a FOMO wave already happened and
  // topped.
  if (m.priceChange5mPct > 5 && m.priceChange5mPct <= 40) patterns.push("price_up_5_to_40pct_5m_early_move");
  if (m.priceChange5mPct > 150 || m.priceChange1hPct > 300) patterns.push("price_already_parabolic_likely_late");
  if (m.priceChange5mPct < -10) patterns.push("price_down_5m_momentum_broken");

  // Room to run — a lower market cap has more headroom for a further
  // double-digit move than a token that's already grown large.
  if (m.marketCapUsd > 0 && m.marketCapUsd < 500_000) patterns.push("market_cap_under_500k_room_to_run");
  else if (m.marketCapUsd >= 500_000 && m.marketCapUsd < 3_000_000) patterns.push("market_cap_under_3m");

  return patterns;
}

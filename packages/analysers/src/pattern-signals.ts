/**
 * Ported from the source bot's `scoring.ts` — the exact categorical
 * "pattern" thresholds computed live (at scoring time) from token metrics,
 * mirrored against learned weights in `learned_patterns` (see
 * learned-patterns-store.ts). Kept as pure functions so they're usable both
 * by RugAnalyser/MoonAnalyser and by unit tests without any DB/network.
 */
export interface PatternMetrics {
  top3HolderPct: number; // 0-100
  liquiditySol: number;
  priceChange5mPct: number;
  volume5mUsd: number;
  holderCount: number;
  priceSol: number;
  graduationStatus: "bonding_curve" | "graduated" | "unknown";
}

export function computeRugPatternIds(m: PatternMetrics): string[] {
  const patterns: string[] = [];

  if (m.top3HolderPct > 50) patterns.push("top3_holders_above_50pct");
  else if (m.top3HolderPct > 40) patterns.push("top3_holders_above_40pct");
  else if (m.top3HolderPct > 30) patterns.push("top3_holders_above_30pct");

  if (m.liquiditySol < 15) patterns.push("liquidity_below_15sol");
  if (m.liquiditySol < 25) patterns.push("liquidity_below_25sol");

  if (m.priceChange5mPct < -10) patterns.push("price_down_5m_at_exit");
  if (m.volume5mUsd < 1000) patterns.push("volume_5m_below_1k");
  if (m.holderCount < 50) patterns.push("holder_count_below_50");
  if (m.holderCount < 100) patterns.push("holder_count_below_100");

  const priceSolExp = m.priceSol > 0 ? Math.floor(Math.log10(m.priceSol)) : -99;
  if (priceSolExp >= -4 && priceSolExp <= -3) patterns.push("entry_price_e4_range");

  return patterns;
}

export function computeMoonPatternIds(m: PatternMetrics): string[] {
  const patterns: string[] = [];

  if (m.top3HolderPct < 15) patterns.push("top3_holders_below_15pct");
  else if (m.top3HolderPct < 20) patterns.push("top3_holders_below_20pct");
  else if (m.top3HolderPct < 25) patterns.push("top3_holders_below_25pct");

  if (m.liquiditySol > 50) patterns.push("liquidity_above_50sol");
  else if (m.liquiditySol > 30) patterns.push("liquidity_above_30sol");
  else if (m.liquiditySol > 20) patterns.push("liquidity_above_20sol");

  if (m.priceChange5mPct > 50) patterns.push("price_up_50pct_5m");
  else if (m.priceChange5mPct > 20) patterns.push("price_up_20pct_5m");
  else if (m.priceChange5mPct > 10) patterns.push("price_up_10pct_5m");

  if (m.volume5mUsd > 10_000) patterns.push("volume_5m_above_10k");
  else if (m.volume5mUsd > 5000) patterns.push("volume_5m_above_5k");
  else if (m.volume5mUsd > 2000) patterns.push("volume_5m_above_2k");

  if (m.holderCount > 500) patterns.push("holder_count_above_500");
  else if (m.holderCount > 200) patterns.push("holder_count_above_200");
  else if (m.holderCount > 100) patterns.push("holder_count_above_100");

  if (m.graduationStatus === "graduated") patterns.push("status_graduated");

  return patterns;
}

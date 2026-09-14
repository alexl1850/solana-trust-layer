/**
 * Chain-agnostic rug-risk heuristic for the multi-chain early-volume alert
 * feature, mirroring volume-divergence.ts's distribution/panic_dump/
 * strong_momentum signal shape but rescaled for the windows DexScreener
 * actually exposes (5m + 1h, not 5m + 15m) — dividing the hourly baseline
 * by 12 to get its per-5-minute equivalent, not by 3.
 *
 * This is the ONLY rug signal available for Ethereum/Base/BSC pairs (no
 * holder-distribution or dev-wallet-cluster data source exists for those
 * chains yet — see fomo-pipeline.ts). For Solana it supplements the real,
 * trained rugAnalyser/moonAnalyser output already computed by the existing
 * ScoringPipeline (see fomo-pipeline.ts's score_events lookup). Treat this
 * heuristic as a lightweight early-warning signal, not a substitute for
 * that trained analysis.
 */
export interface FomoDivergenceResult {
  /** positive = risk penalty, negative = bonus (strong_momentum) */
  penalty: number;
  signal: "none" | "distribution" | "panic_dump" | "strong_momentum";
  detail: string;
}

export function detectFomoRugDivergence(
  priceChange5mPct: number,
  priceChange1hPct: number,
  volume5mUsd: number,
  volume1hUsd: number,
): FomoDivergenceResult {
  if (volume5mUsd < 100 || volume1hUsd < 100) {
    return { penalty: 0, signal: "none", detail: "insufficient volume data" };
  }

  const hourlyRatePerFiveMin = volume1hUsd / 12; // per 5-min equivalent
  const volRatio = volume5mUsd / Math.max(hourlyRatePerFiveMin, 1);

  // Price flat/up but volume dropping sharply = insiders exiting quietly.
  if (priceChange5mPct >= -5 && volRatio < 0.4) {
    return {
      penalty: 10,
      signal: "distribution",
      detail: `price flat/up but volume dropped ${((1 - volRatio) * 100).toFixed(0)}% vs hourly rate — distribution signal`,
    };
  }

  // Price dropping + volume spiking = a dump/rug in progress.
  if (priceChange5mPct < -15 && volRatio > 2.5) {
    return {
      penalty: 15,
      signal: "panic_dump",
      detail: `price -${Math.abs(priceChange5mPct).toFixed(1)}% + volume spike ${volRatio.toFixed(1)}x hourly rate — panic/rug signal`,
    };
  }

  // Strong momentum: price up + volume rising together = healthy, not a dump.
  if (priceChange5mPct > 10 && volRatio > 1.5) {
    return {
      penalty: -5,
      signal: "strong_momentum",
      detail: `price +${priceChange5mPct.toFixed(1)}% + volume rising ${volRatio.toFixed(1)}x hourly rate — strong momentum`,
    };
  }

  return { penalty: 0, signal: "none", detail: "no divergence detected" };
}

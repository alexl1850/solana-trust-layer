/**
 * Ported verbatim (logic-wise) from the source bot's `volumeDivergence.ts`.
 *
 * Distribution pattern: price holding up but volume dropping = insiders
 * selling into retail. Score penalty when detected.
 *
 * Panic/rug pattern: price dropping + volume spiking = dump in progress.
 */
export interface DivergenceResult {
  /** positive = score penalty, negative = score bonus */
  penalty: number;
  signal: "none" | "distribution" | "panic_dump" | "strong_momentum";
  detail: string;
}

export function detectVolumeDivergence(
  priceChange5mPct: number,
  priceChange15mPct: number,
  volume5mUsd: number,
  volume15mUsd: number,
): DivergenceResult {
  if (volume5mUsd < 100 || volume15mUsd < 100) {
    return { penalty: 0, signal: "none", detail: "insufficient volume data" };
  }

  const vol15mRate = volume15mUsd / 3; // per 5-min equivalent
  const volRatio = volume5mUsd / Math.max(vol15mRate, 1);

  // Price flat/up but volume dropping sharply = distribution
  if (priceChange5mPct >= -5 && volRatio < 0.4) {
    return {
      penalty: 10,
      signal: "distribution",
      detail: `price flat/up but volume dropped ${((1 - volRatio) * 100).toFixed(0)}% — distribution signal`,
    };
  }

  // Price dropping + volume spiking = panic or rug in progress
  if (priceChange5mPct < -15 && volRatio > 2.5) {
    return {
      penalty: 15,
      signal: "panic_dump",
      detail: `price -${Math.abs(priceChange5mPct).toFixed(1)}% + volume spike ${volRatio.toFixed(1)}x — panic/rug signal`,
    };
  }

  // Strong momentum: price up + volume rising = healthy
  if (priceChange5mPct > 10 && volRatio > 1.5) {
    return {
      penalty: -5, // slight bonus for strong momentum
      signal: "strong_momentum",
      detail: `price +${priceChange5mPct.toFixed(1)}% + volume rising ${volRatio.toFixed(1)}x — strong momentum`,
    };
  }

  return { penalty: 0, signal: "none", detail: "no divergence detected" };
}

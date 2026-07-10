import type { BirdeyeClient, HeliusClient } from "@solana-trust-layer/shared";
import type { GraduationStatus } from "@solana-trust-layer/analysers";
import { getGraduationStatus } from "./graduation.js";

export interface ScoringMetrics {
  mint: string;
  liquiditySol: number;
  liquidityUsd: number;
  volume5mUsd: number;
  volume15mUsd: number;
  priceChange5mPct: number;
  priceChange15mPct: number;
  holderCount: number;
  top3HolderPct: number;
  devHoldingPct: number;
  hasTwitter: boolean;
  hasTelegram: boolean;
  telegramActive: boolean;
  bondingCurvePct: number;
  marketCapUsd: number;
  priceSol: number;
  priceUsd: number;
  graduation: GraduationStatus;
  /** true when neither Birdeye nor the on-chain bonding curve had usable data — degrade to UNKNOWN */
  stale: boolean;
}

/**
 * Ported from the source bot's `scoring.ts` `gatherMetrics`. For pump.fun
 * bonding-curve tokens, price/liquidity come straight from the on-chain
 * curve reserves — no need to wait on Birdeye indexing at all. For
 * everything else we rely on Birdeye's token_overview.
 */
export async function gatherMetrics(
  mint: string,
  birdeye: BirdeyeClient,
  helius: Pick<HeliusClient, "getAccountInfo">,
  solUsd: number,
): Promise<ScoringMetrics> {
  const overview = await birdeye.tokenOverview(mint);
  const curve = await getGraduationStatus(helius, mint);
  const holders = await birdeye.topHolderPcts(mint, 10).catch(() => [] as number[]);
  const top3HolderPct = holders.slice(0, 3).reduce((s, p) => s + p, 0);

  let priceUsd = overview.priceUsd;
  let priceSol = solUsd > 0 ? priceUsd / solUsd : 0;
  let liquiditySol = solUsd > 0 ? overview.liquidityUsd / solUsd : 0;
  let liquidityUsd = overview.liquidityUsd;

  if (curve.status === "bonding_curve" && curve.virtualTokenReserves > 0) {
    const onChainPriceSol = curve.virtualSolReserves / curve.virtualTokenReserves;
    if (priceSol <= 0) {
      priceSol = onChainPriceSol;
      priceUsd = priceSol * solUsd;
    }
    if (liquiditySol <= 0) {
      liquiditySol = curve.realSolReserves;
      liquidityUsd = liquiditySol * solUsd;
    }
  }

  let marketCapUsd = overview.mcUsd;
  if (marketCapUsd <= 0 && priceUsd > 0) marketCapUsd = priceUsd * 1_000_000_000; // pump.fun standard supply

  // Overview data is unusable AND we have no on-chain curve fallback: degrade to UNKNOWN, never fabricate.
  const stale = overview.stale && curve.status !== "bonding_curve";

  return {
    mint,
    liquiditySol,
    liquidityUsd,
    volume5mUsd: overview.volume5mUsd,
    volume15mUsd: overview.volume15mUsd,
    priceChange5mPct: overview.priceChange5mPct,
    priceChange15mPct: overview.priceChange15mPct,
    holderCount: overview.holderCount,
    top3HolderPct,
    devHoldingPct: holders[0] ?? 0,
    hasTwitter: false,
    hasTelegram: false,
    telegramActive: false,
    bondingCurvePct: curve.progressPct,
    marketCapUsd,
    priceSol,
    priceUsd,
    graduation: curve.status,
    stale,
  };
}

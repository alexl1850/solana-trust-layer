import type { DexScreenerClient, DexScreenerChainId } from "@solana-trust-layer/shared";
import type { FomoMetrics } from "@solana-trust-layer/analysers";

export interface FomoCandidate extends FomoMetrics {
  tokenAddress: string;
  pairAddress: string;
  symbol: string;
  name: string;
  dexId: string;
  /** true when DexScreener had no usable data — degrade to UNKNOWN, never fabricate a score. */
  stale: boolean;
}

export async function gatherFomoMetrics(
  chain: DexScreenerChainId,
  pairAddress: string,
  dexscreener: Pick<DexScreenerClient, "getPair">,
): Promise<FomoCandidate> {
  const pair = await dexscreener.getPair(chain, pairAddress);
  const pairAgeMinutes = pair.pairCreatedAt ? (Date.now() - pair.pairCreatedAt) / 60_000 : Number.POSITIVE_INFINITY;

  return {
    tokenAddress: pair.baseToken.address,
    pairAddress: pair.pairAddress || pairAddress,
    symbol: pair.baseToken.symbol,
    name: pair.baseToken.name,
    dexId: pair.dexId,
    liquidityUsd: pair.liquidityUsd,
    volume5mUsd: pair.volume5mUsd,
    volume1hUsd: pair.volume1hUsd,
    priceChange5mPct: pair.priceChange5mPct,
    priceChange1hPct: pair.priceChange1hPct,
    buys5m: pair.buys5m,
    sells5m: pair.sells5m,
    pairAgeMinutes,
    marketCapUsd: pair.marketCapUsd,
    stale: pair.stale,
  };
}

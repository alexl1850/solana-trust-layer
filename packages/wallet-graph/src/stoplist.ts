/**
 * Known CEX / bridge wallets where a funding walk stops (PROJECT.md Phase 1,
 * stop condition #1). This list is intentionally small and hand-maintained —
 * it grows as new CEX deposit/withdrawal hot wallets are identified. Seed
 * data; extend via `known_infrastructure_wallets` in Postgres for anything
 * discovered after deploy (this const list is the bootstrap set only).
 */
export const KNOWN_CEX_WALLETS: ReadonlySet<string> = new Set([
  // Binance hot wallets (placeholders — replace with verified addresses before launch)
  "5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9",
  // Coinbase
  "H8sMJSCQxfKiFTCfDR3DUMLPwcRbM61LGFJ8N4dK3WjS",
  // OKX
  "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
  // Bybit
  "AC5RDfQFmDS1deWZos921JfqscXdByf8BKHs5ACWjtW2",
]);

export const KNOWN_BRIDGE_WALLETS: ReadonlySet<string> = new Set([
  // Wormhole token bridge (placeholder)
  "3u8hJUVTA4jH1wYAyUur7FFZVQ8H635K3tSHHF4ssjQ5",
]);

export const INFRASTRUCTURE_TX_COUNT_THRESHOLD = 10_000;
export const DUST_FILTER_LAMPORTS = 0.05 * 1e9;
export const MAX_FUNDING_HOPS = 3;

export type StopReason = "cex" | "bridge" | "infrastructure" | null;

export function classifyStopWallet(wallet: {
  address: string;
  txCount: number;
}): StopReason {
  if (KNOWN_CEX_WALLETS.has(wallet.address)) return "cex";
  if (KNOWN_BRIDGE_WALLETS.has(wallet.address)) return "bridge";
  if (wallet.txCount > INFRASTRUCTURE_TX_COUNT_THRESHOLD) return "infrastructure";
  return null;
}

export interface DevWalletBlacklistEntry {
  wallet: string;
  reason: string;
  addedAt: Date;
}

/**
 * PORT STATUS: the source bot's `devWalletTracker` blacklist
 * (`dev-wallets.json`, ~60 entries) turned out to be unusable seed data —
 * it contains a real bug. `rugAnalyser.ts` calls
 * `recordDevRug(pos.mint, pos.mint)`, passing the token mint as BOTH the
 * "wallet" and "tokenMint" arguments (the source's `Position` type has no
 * deployer/creator wallet field at all). Every tracked "wallet" in the
 * dataset is therefore actually a token mint address, and since no mint
 * repeats, the tracker's "2+ rugs = hard reject" logic could never have
 * fired on a real repeat-offender deployer in production.
 *
 * Nothing here is portable as deployer-wallet history. Our own
 * packages/wallet-graph supersedes this feature properly: it derives the
 * real deployer wallet from the on-chain transaction (see
 * services/ingest's discovery/launch-listener, `token.creator`) and traces
 * its actual funding graph — the bug above never touches that path.
 */
export const DEV_WALLET_BLACKLIST_SEED: DevWalletBlacklistEntry[] = [];

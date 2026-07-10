export interface DevWalletBlacklistEntry {
  wallet: string;
  reason: string;
  addedAt: Date;
}

/**
 * PORT TARGET: `devWalletTracker` + its dev-wallet blacklist from the source
 * bot. This is seed data, not a running service: on backfill, every
 * blacklisted wallet becomes a `wallets` row and — via
 * packages/wallet-graph's funding walk — gets folded into the cluster graph
 * so its known rug history is attached from day one (PROJECT.md Phase 1:
 * "Seed the graph by backfilling from devWalletTracker's blacklist").
 *
 * Populate `DEV_WALLET_BLACKLIST_SEED` from the source bot's blacklist file
 * once it's available, then run the backfill script (packages/wallet-graph
 * backfill path) once against it.
 */
export const DEV_WALLET_BLACKLIST_SEED: DevWalletBlacklistEntry[] = [
  // TODO: populate from source bot's devWalletTracker blacklist.
];

// Solana addresses are base58, 32-44 chars (32-byte pubkey, no 0/O/I/l).
const BASE58_CA_REGEX = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g;

/** Extracts candidate Solana contract addresses from free text (a tweet). No on-chain validation here. */
export function extractCandidateAddresses(text: string): string[] {
  return [...new Set(text.match(BASE58_CA_REGEX) ?? [])];
}

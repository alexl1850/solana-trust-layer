import { createHash } from "node:crypto";

function sha256(input: string): Buffer {
  return createHash("sha256").update(input).digest();
}

function hashPair(a: Buffer, b: Buffer): Buffer {
  // Sort so the root is order-independent for any given pair, and prefix
  // with a domain tag to avoid classic second-preimage tree-forgery attacks
  // (an attacker splicing a leaf hash in as an internal-node hash).
  const [first, second] = Buffer.compare(a, b) <= 0 ? [a, b] : [b, a];
  return createHash("sha256").update(Buffer.from([0x01])).update(first).update(second).digest();
}

export interface MerkleTree {
  root: string;
  leaves: string[];
}

/**
 * Builds a Merkle tree over an hour's score_events (one leaf per event, hex
 * SHA-256 of its canonical JSON). The root is what gets memo'd on-chain
 * hourly so any historical score is provably not backdated — see
 * PROJECT.md Phase 2 receipts hashing.
 */
export function buildMerkleTree(eventPayloads: string[]): MerkleTree {
  if (eventPayloads.length === 0) {
    throw new Error("Cannot build a Merkle tree over zero events");
  }

  const leaves = eventPayloads.map((p) => sha256(p));
  let level = leaves;

  while (level.length > 1) {
    const next: Buffer[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i]!;
      const right = i + 1 < level.length ? level[i + 1]! : left; // duplicate last odd leaf
      next.push(hashPair(left, right));
    }
    level = next;
  }

  return {
    root: level[0]!.toString("hex"),
    leaves: leaves.map((l) => l.toString("hex")),
  };
}

import type { HeliusClient, ParsedSolTransfer } from "@solana-trust-layer/shared";
import { classifyStopWallet, DUST_FILTER_LAMPORTS, MAX_FUNDING_HOPS, type StopReason } from "./stoplist.js";

export interface FundingWalkEdge {
  from: string;
  to: string;
  lamports: number;
  signature: string;
  slot: number;
  blockTimeMs: number | null;
  hop: number;
}

export interface FundingWalkResult {
  edges: FundingWalkEdge[];
  /** Wallets where the walk stopped, and why (cex/bridge/infrastructure) — not followed further. */
  stoppedAt: Array<{ wallet: string; reason: StopReason }>;
  /** True if the deployer wallet itself had zero traceable funders — the UNKNOWN case. */
  noTraceableHistory: boolean;
}

export interface TxCountLookup {
  (wallet: string): Promise<number>;
}

/**
 * Walks a deployer wallet's SOL/wSOL funding history back up to
 * MAX_FUNDING_HOPS (3), applying the dust filter and CEX/bridge/
 * infrastructure stop conditions from PROJECT.md Phase 1. Pure BFS over
 * live Helius calls — no DB access here, so it's unit-testable with a fake
 * HeliusClient and reusable by both the live ingest path and the backfill
 * script.
 */
export async function walkFundingHistory(
  helius: Pick<HeliusClient, "getIncomingSolTransfers">,
  getTxCount: TxCountLookup,
  deployerWallet: string,
): Promise<FundingWalkResult> {
  const edges: FundingWalkEdge[] = [];
  const stoppedAt: FundingWalkResult["stoppedAt"] = [];
  const visited = new Set<string>([deployerWallet]);

  let frontier = [deployerWallet];

  for (let hop = 0; hop < MAX_FUNDING_HOPS && frontier.length > 0; hop++) {
    const nextFrontier: string[] = [];

    for (const wallet of frontier) {
      const transfers: ParsedSolTransfer[] = await helius.getIncomingSolTransfers(wallet, {
        minLamports: DUST_FILTER_LAMPORTS,
      });

      for (const transfer of transfers) {
        if (transfer.from === wallet || visited.has(transfer.from)) continue;

        edges.push({
          from: transfer.from,
          to: wallet,
          lamports: transfer.lamports,
          signature: transfer.signature,
          slot: transfer.slot,
          blockTimeMs: transfer.blockTime ? transfer.blockTime * 1000 : null,
          hop,
        });

        const txCount = await getTxCount(transfer.from);
        const stopReason = classifyStopWallet({ address: transfer.from, txCount });

        visited.add(transfer.from);

        if (stopReason) {
          stoppedAt.push({ wallet: transfer.from, reason: stopReason });
        } else {
          nextFrontier.push(transfer.from);
        }
      }
    }

    frontier = nextFrontier;
  }

  return {
    edges,
    stoppedAt,
    noTraceableHistory: edges.length === 0,
  };
}

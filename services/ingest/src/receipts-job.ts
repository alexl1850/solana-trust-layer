import cron from "node-cron";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction } from "@solana/web3.js";
import { buildMerkleTree } from "./merkle.js";

const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

export interface ReceiptsJobOptions {
  cronExpression: string;
  rpcUrl: string;
  /** base58-encoded secret key of the project's receipts-anchoring wallet */
  walletSecretKey: string;
}

/**
 * Hourly job (PROJECT.md Phase 2 "Receipts hashing"): takes the last hour's
 * score_events, builds a Merkle root over them, and anchors that root
 * on-chain via a memo transaction from the project wallet. Anyone can later
 * recompute the same root from the stored score_events and verify it
 * against the on-chain memo — proving no historical score was backdated.
 */
export function scheduleReceiptsJob(db: SupabaseClient, opts: ReceiptsJobOptions): void {
  cron.schedule(opts.cronExpression, () => {
    runReceiptsJob(db, opts).catch((err) => console.error("[receipts-job] failed:", err));
  });
}

export async function runReceiptsJob(db: SupabaseClient, opts: ReceiptsJobOptions): Promise<void> {
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - 60 * 60 * 1000);

  const { data: events, error } = await db
    .from("score_events")
    .select("*")
    .gte("created_at", periodStart.toISOString())
    .lt("created_at", periodEnd.toISOString())
    .order("created_at", { ascending: true });
  if (error) throw new Error(`load score_events: ${error.message}`);

  if (!events || events.length === 0) {
    console.log("[receipts-job] no score_events in the last hour, skipping");
    return;
  }

  const payloads = events.map((e) => JSON.stringify(e));
  const tree = buildMerkleTree(payloads);

  const signature = opts.walletSecretKey ? await anchorOnChain(opts, tree.root) : null;

  const { error: insertErr } = await db.from("receipts").insert({
    period_start: periodStart.toISOString(),
    period_end: periodEnd.toISOString(),
    merkle_root: tree.root,
    event_count: events.length,
    solana_tx_signature: signature,
    anchored_at: signature ? new Date().toISOString() : null,
  });
  if (insertErr) throw new Error(`insert receipt: ${insertErr.message}`);

  console.log(`[receipts-job] anchored ${events.length} events, root=${tree.root}, tx=${signature ?? "none"}`);
}

async function anchorOnChain(opts: ReceiptsJobOptions, merkleRoot: string): Promise<string> {
  const connection = new Connection(opts.rpcUrl, "confirmed");
  const keypair = Keypair.fromSecretKey(Buffer.from(opts.walletSecretKey, "base64"));

  const instruction = new TransactionInstruction({
    keys: [],
    programId: MEMO_PROGRAM_ID,
    data: Buffer.from(`solana-trust-layer:receipts:${merkleRoot}`, "utf-8"),
  });

  const transaction = new Transaction().add(instruction);
  return sendAndConfirmTransaction(connection, transaction, [keypair]);
}

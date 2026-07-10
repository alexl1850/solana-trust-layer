import { Connection, PublicKey } from "@solana/web3.js";

export interface ParsedSolTransfer {
  signature: string;
  slot: number;
  blockTime: number | null;
  from: string;
  to: string;
  lamports: number;
}

/** Thin wrapper around Helius RPC. Websocket launch-detection lives in services/ingest. */
export class HeliusClient {
  private readonly connection: Connection;

  constructor(rpcUrl: string) {
    if (!rpcUrl) throw new Error("Helius RPC URL is required");
    this.connection = new Connection(rpcUrl, "confirmed");
  }

  /**
   * Fetch recent SOL/wSOL transfers INTO `wallet`, used by the wallet-graph
   * funding walk. Returns raw parsed transfers above the caller-supplied
   * dust threshold (default 0.05 SOL, per PROJECT.md).
   */
  async getIncomingSolTransfers(
    wallet: string,
    opts: { limit?: number; minLamports?: number } = {},
  ): Promise<ParsedSolTransfer[]> {
    const { limit = 50, minLamports = 0.05 * 1e9 } = opts;
    const pubkey = new PublicKey(wallet);

    const signatures = await this.connection.getSignaturesForAddress(pubkey, { limit });

    const transfers: ParsedSolTransfer[] = [];
    for (const sigInfo of signatures) {
      const tx = await this.connection.getParsedTransaction(sigInfo.signature, {
        maxSupportedTransactionVersion: 0,
      });
      if (!tx?.meta) continue;

      const accountKeys = tx.transaction.message.accountKeys.map((k) => k.pubkey.toBase58());
      const walletIndex = accountKeys.indexOf(wallet);
      if (walletIndex === -1) continue;

      const preBalance = tx.meta.preBalances[walletIndex] ?? 0;
      const postBalance = tx.meta.postBalances[walletIndex] ?? 0;
      const delta = postBalance - preBalance;
      if (delta < minLamports) continue;

      // Best-effort sender: largest balance decrease among other accounts in the tx.
      let sender: string | null = null;
      let largestDecrease = 0;
      accountKeys.forEach((addr, i) => {
        if (addr === wallet) return;
        const change = (tx.meta!.preBalances[i] ?? 0) - (tx.meta!.postBalances[i] ?? 0);
        if (change > largestDecrease) {
          largestDecrease = change;
          sender = addr;
        }
      });
      if (!sender) continue;

      transfers.push({
        signature: sigInfo.signature,
        slot: tx.slot,
        blockTime: tx.blockTime ?? null,
        from: sender,
        to: wallet,
        lamports: delta,
      });
    }

    return transfers;
  }

  /** Total transaction count for a wallet — used to flag infrastructure wallets (>10k txs). */
  async getApproxTransactionCount(wallet: string, sampleLimit = 1000): Promise<number> {
    const pubkey = new PublicKey(wallet);
    const signatures = await this.connection.getSignaturesForAddress(pubkey, { limit: sampleLimit });
    return signatures.length;
  }

  /** Balance of a specific SPL mint for a wallet, used for tier gating. */
  async getTokenBalance(wallet: string, mint: string): Promise<bigint> {
    const owner = new PublicKey(wallet);
    const mintPubkey = new PublicKey(mint);
    const accounts = await this.connection.getParsedTokenAccountsByOwner(owner, { mint: mintPubkey });

    let total = 0n;
    for (const { account } of accounts.value) {
      const amount = account.data.parsed?.info?.tokenAmount?.amount as string | undefined;
      if (amount) total += BigInt(amount);
    }
    return total;
  }

  /** On-chain total supply (UI units) for a mint — used to turn Birdeye's raw holder amounts into percentages. */
  async getTokenSupplyUi(mint: string): Promise<number> {
    const supply = await this.connection.getTokenSupply(new PublicKey(mint));
    return supply.value.uiAmount ?? 0;
  }

  /** Raw account info, e.g. for reading a pump.fun bonding-curve PDA's account data. */
  async getAccountInfo(address: string): Promise<{ data: Buffer } | null> {
    const info = await this.connection.getAccountInfo(new PublicKey(address));
    if (!info) return null;
    return { data: info.data };
  }

  /**
   * Token-balance deltas for a transaction — used by launch detection to
   * work out which mint is genuinely new (see services/ingest's
   * launch-listener for the venue-specific picking logic).
   */
  async getTransactionTokenBalances(signature: string): Promise<TransactionTokenBalances | null> {
    const tx = await this.connection.getParsedTransaction(signature, {
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed",
    });
    if (!tx?.meta) return null;

    const accountKeys = tx.transaction.message.accountKeys.map((k) => k.pubkey.toBase58());
    const preMints = (tx.meta.preTokenBalances ?? []).map((b) => b.mint);
    const post = tx.meta.postTokenBalances ?? [];
    const postMints = post.map((b) => b.mint);
    const postMintOwnerPrograms: Record<string, string> = {};
    for (const b of post) {
      if (b.mint) postMintOwnerPrograms[b.mint] = String((b as { programId?: string }).programId ?? "");
    }

    return { accountKeys, preMints, postMints, postMintOwnerPrograms };
  }
}

export interface TransactionTokenBalances {
  accountKeys: string[];
  preMints: string[];
  postMints: string[];
  /** mint -> owning token program id (used for Token-2022 detection) */
  postMintOwnerPrograms: Record<string, string>;
}

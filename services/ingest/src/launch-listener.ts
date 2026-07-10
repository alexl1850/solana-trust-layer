import WebSocket from "ws";
import { PublicKey } from "@solana/web3.js";
import type { HeliusClient } from "@solana-trust-layer/shared";
import type { LaunchEvent } from "./pipeline.js";

type Venue = "pumpfun" | "pumpswap" | "raydium";

export const PUMP_FUN_PROGRAM_ID = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
export const PUMPSWAP_PROGRAM_ID = new PublicKey("pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA");
export const RAYDIUM_AMM_V4_PROGRAM_ID = new PublicKey("675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8");

const WSOL_MINT = "So11111111111111111111111111111111111111112";
const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

/**
 * Venue-specific mint selection, pulled out as a pure function for unit
 * testing. pump.fun `Create` mints a genuinely new token (post-only);
 * PumpSwap/Raydium pool creation ALSO mints a brand-new LP token that must
 * be excluded — the actually-traded token already existed pre-tx (it's
 * deposited into the new pool), so it shows up in both pre and post
 * balances.
 */
export function pickNewMint(venue: Venue, preMints: string[], postMints: string[]): string | undefined {
  const pre = new Set(preMints);
  const postUnique = [...new Set(postMints)];

  if (venue === "pumpfun") {
    return postUnique.find((m) => !pre.has(m) && m !== WSOL_MINT);
  }
  return postUnique.find((m) => pre.has(m) && m !== WSOL_MINT);
}

export interface LaunchListenerOptions {
  wsUrl: string;
}

/**
 * Ported from the source bot's `discovery.ts` (`TokenDiscovery`) — the
 * Helius websocket launch-detection feed named explicitly in PROJECT.md
 * Phase 1/2. Subscribes to program logs for pump.fun, PumpSwap, and Raydium
 * AMM v4, and resolves each launch transaction to the newly-created mint +
 * creator wallet.
 *
 * Mint selection is venue-specific:
 *  - pump.fun `Create`: the meme token itself is genuinely new (appears
 *    only in post-token-balances, excluding wSOL).
 *  - PumpSwap/Raydium pool creation: the tx ALSO mints a brand-new LP
 *    token — that's not what we want. The actual traded token already
 *    existed (it's deposited INTO the pool), so it appears in BOTH pre and
 *    post token balances.
 */
export class LaunchListener {
  private ws: WebSocket | null = null;
  private reconnectAttempt = 0;
  private stopped = false;
  private seenMints = new Set<string>();
  private subIdToVenue = new Map<number, Venue>();
  private pendingReqs = new Map<number, Venue>();
  private nextReqId = 1;

  constructor(
    private readonly opts: LaunchListenerOptions,
    private readonly helius: Pick<HeliusClient, "getTransactionTokenBalances">,
    private readonly onLaunch: (event: LaunchEvent) => void,
  ) {}

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.ws?.close();
  }

  private connect(): void {
    const ws = new WebSocket(this.opts.wsUrl);
    this.ws = ws;

    ws.on("open", () => {
      this.reconnectAttempt = 0;
      this.subscribeLogs(PUMP_FUN_PROGRAM_ID.toBase58(), "pumpfun");
      this.subscribeLogs(PUMPSWAP_PROGRAM_ID.toBase58(), "pumpswap");
      this.subscribeLogs(RAYDIUM_AMM_V4_PROGRAM_ID.toBase58(), "raydium");
    });

    ws.on("message", (raw) => this.onMessage(raw.toString()));

    ws.on("close", () => {
      if (this.stopped) return;
      const delay = Math.min(30_000, 1000 * 2 ** this.reconnectAttempt++);
      setTimeout(() => this.connect(), delay);
    });

    ws.on("error", () => ws.close());
  }

  private subscribeLogs(programId: string, venue: Venue): void {
    const id = this.nextReqId++;
    this.pendingReqs.set(id, venue);
    this.ws?.send(
      JSON.stringify({
        jsonrpc: "2.0",
        id,
        method: "logsSubscribe",
        params: [{ mentions: [programId] }, { commitment: "confirmed" }],
      }),
    );
  }

  private onMessage(raw: string): void {
    let msg: {
      id?: number;
      result?: number;
      method?: string;
      params?: { subscription: number; result: { value: { signature: string; logs: string[]; err: unknown } } };
    };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg.id !== undefined && typeof msg.result === "number") {
      const venue = this.pendingReqs.get(msg.id);
      if (venue) {
        this.subIdToVenue.set(msg.result, venue);
        this.pendingReqs.delete(msg.id);
      }
      return;
    }

    if (msg.method !== "logsNotification" || !msg.params) return;
    const venue = this.subIdToVenue.get(msg.params.subscription);
    if (!venue) return;

    const { signature, logs, err } = msg.params.result.value;
    if (err) return;

    const isLaunch =
      (venue === "pumpfun" &&
        logs.some((l) => /Instruction: Create$|Instruction: Create\b(?!\w)/.test(l) && !/CreateAccount/.test(l))) ||
      (venue === "pumpswap" && logs.some((l) => /Instruction: CreatePool/.test(l))) ||
      (venue === "raydium" && logs.some((l) => /initialize2|Instruction: Initialize2/i.test(l)));

    if (!isLaunch) return;
    void this.resolveLaunch(signature, venue);
  }

  private async resolveLaunch(signature: string, venue: Venue): Promise<void> {
    try {
      const balances = await this.helius.getTransactionTokenBalances(signature);
      if (!balances) return;

      const mint = pickNewMint(venue, balances.preMints, balances.postMints);
      if (!mint) return;
      if (this.seenMints.has(mint)) return;
      this.seenMints.add(mint);
      if (this.seenMints.size > 5000) {
        this.seenMints = new Set([...this.seenMints].slice(-2500));
      }

      const creator = balances.accountKeys[0];
      if (!creator) return;

      const isToken2022 = balances.postMintOwnerPrograms[mint] === TOKEN_2022_PROGRAM_ID;

      this.onLaunch({
        mint,
        deployerWallet: creator,
        name: `${venue} launch ${mint.slice(0, 8)}`,
        symbol: mint.slice(0, 4).toUpperCase(),
        venue,
        isToken2022,
      });
    } catch {
      // best-effort; a failed resolve just means this launch is missed, not fatal
    }
  }
}

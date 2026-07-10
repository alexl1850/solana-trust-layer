import WebSocket from "ws";
import type { LaunchEvent } from "./pipeline.js";

export interface LaunchListenerOptions {
  wsUrl: string;
  /** Program ID(s) to watch for new-pool/new-mint activity (e.g. a launchpad program). */
  programIds: string[];
}

/**
 * PORT TARGET: the source bot's "Helius websocket discovery" module. That
 * module already knows how to recognize a new-token-launch transaction for
 * the specific launchpad(s) it traded on and pull the mint + deployer
 * wallet out of it — port that parsing logic into `parseLaunchFromLogs`
 * below.
 *
 * This class handles the durable-connection plumbing (Helius `logsSubscribe`
 * over websocket, reconnect-on-drop) so the port only needs to fill in
 * per-transaction parsing.
 */
export class LaunchListener {
  private ws: WebSocket | null = null;
  private reconnectAttempt = 0;
  private stopped = false;

  constructor(
    private readonly opts: LaunchListenerOptions,
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
      for (const programId of this.opts.programIds) {
        ws.send(
          JSON.stringify({
            jsonrpc: "2.0",
            id: programId,
            method: "logsSubscribe",
            params: [{ mentions: [programId] }, { commitment: "confirmed" }],
          }),
        );
      }
    });

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        const logs: string[] | undefined = msg?.params?.result?.value?.logs;
        const signature: string | undefined = msg?.params?.result?.value?.signature;
        if (!logs || !signature) return;

        const launch = parseLaunchFromLogs(logs, signature);
        if (launch) this.onLaunch(launch);
      } catch {
        // malformed frame — ignore and keep the connection alive
      }
    });

    ws.on("close", () => this.scheduleReconnect());
    ws.on("error", () => ws.close());
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    const delayMs = Math.min(30_000, 1000 * 2 ** this.reconnectAttempt);
    this.reconnectAttempt += 1;
    setTimeout(() => {
      if (!this.stopped) this.connect();
    }, delayMs);
  }
}

/**
 * TODO: port the real launch-detection parser from the source bot. This
 * placeholder never matches, so no fabricated launches are emitted — the
 * pipeline simply stays idle until the real parser is dropped in.
 */
function parseLaunchFromLogs(_logs: string[], _signature: string): LaunchEvent | null {
  return null;
}

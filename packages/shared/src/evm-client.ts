import { Interface, WebSocketProvider, type Log } from "ethers";

export type EvmChain = "ethereum" | "base" | "bsc";

export interface EvmFactoryConfig {
  /** Uniswap-V2-style factory (PancakeSwap V2 on BSC uses the same PairCreated event shape). */
  v2FactoryAddress?: string;
  /** Uniswap-V3-style factory (PoolCreated). */
  v3FactoryAddress?: string;
}

export interface EvmPairEvent {
  chain: EvmChain;
  pairAddress: string;
  token0: string;
  token1: string;
  source: "v2" | "v3";
}

const V2_FACTORY_ABI = ["event PairCreated(address indexed token0, address indexed token1, address pair, uint256)"];
const V3_FACTORY_ABI = [
  "event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)",
];

const v2Iface = new Interface(V2_FACTORY_ABI);
const v3Iface = new Interface(V3_FACTORY_ABI);

/**
 * Watches Uniswap-V2-style and Uniswap-V3-style factory contracts for new
 * pair/pool creation — the EVM analogue of launch-listener.ts's Solana
 * program-log detection, feeding the same "new launch" discovery role but
 * for Ethereum/Base/BSC. Topic hashes are computed at runtime via ethers'
 * own `Interface.getEvent(...).topicHash` (verified against ethers 6.13 in
 * this repo — see the topic-hash values match the well-known Uniswap V2
 * PairCreated / V3 PoolCreated signatures), never hardcoded as a guessed
 * constant.
 *
 * Factory addresses are caller-supplied via `EvmFactoryConfig` (see
 * config.ts's `evm` section) — verify them against each protocol's official
 * deployment docs before relying on this in production; nothing here
 * hardcodes a specific factory address.
 *
 * Detect-only: this only discovers new pairs, it never places an order or
 * holds a wallet key (see PROJECT.md hard rule 1).
 */
export class EvmLaunchListener {
  private provider: WebSocketProvider | null = null;
  private stopped = false;
  private heartbeat: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly chain: EvmChain,
    private readonly wssUrl: string,
    private readonly factories: EvmFactoryConfig,
    private readonly onPair: (event: EvmPairEvent) => void,
    private readonly heartbeatIntervalMs = 30_000,
  ) {}

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.heartbeat) clearInterval(this.heartbeat);
    const provider = this.provider;
    this.provider = null;
    provider?.removeAllListeners();
    void provider?.destroy();
  }

  private connect(): void {
    const provider = new WebSocketProvider(this.wssUrl);
    this.provider = provider;
    this.subscribe(provider);

    // ethers v6's WebSocketProvider reconnect behaviour differs across minor
    // versions, so rather than depend on internal socket event hooks, use a
    // plain liveness probe: any healthy provider answers getBlockNumber();
    // if it doesn't within one interval, tear down and reconnect from
    // scratch (mirrors launch-listener.ts's exponential-backoff intent with
    // a version-independent mechanism).
    this.heartbeat = setInterval(() => {
      provider.getBlockNumber().catch(() => {
        if (this.stopped || this.provider !== provider) return;
        if (this.heartbeat) clearInterval(this.heartbeat);
        provider.removeAllListeners();
        void provider.destroy();
        this.connect();
      });
    }, this.heartbeatIntervalMs);
  }

  private subscribe(provider: WebSocketProvider): void {
    if (this.factories.v2FactoryAddress) {
      const topic = v2Iface.getEvent("PairCreated")!.topicHash;
      provider.on({ address: this.factories.v2FactoryAddress, topics: [topic] }, (log: Log) =>
        this.handleLog(log, v2Iface, "v2"),
      );
    }
    if (this.factories.v3FactoryAddress) {
      const topic = v3Iface.getEvent("PoolCreated")!.topicHash;
      provider.on({ address: this.factories.v3FactoryAddress, topics: [topic] }, (log: Log) =>
        this.handleLog(log, v3Iface, "v3"),
      );
    }
  }

  private handleLog(log: Log, iface: Interface, source: "v2" | "v3"): void {
    try {
      const parsed = iface.parseLog({ topics: log.topics as string[], data: log.data });
      if (!parsed) return;
      const pairAddress: string = source === "v2" ? parsed.args.pair : parsed.args.pool;
      this.onPair({
        chain: this.chain,
        pairAddress,
        token0: parsed.args.token0,
        token1: parsed.args.token1,
        source,
      });
    } catch {
      // best-effort decode; a failed parse just means this event is missed, not fatal
    }
  }
}

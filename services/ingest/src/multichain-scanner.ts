import { EvmLaunchListener, type EvmChain, type EvmFactoryConfig } from "@solana-trust-layer/shared";
import type { FomoPipeline } from "./fomo-pipeline.js";

export interface EvmChainConfig {
  wssUrl: string;
  v2FactoryAddress?: string;
  v3FactoryAddress?: string;
}

/** The product's own targeted window (PROJECT.md: "before they hit FOMO trading") — stop watching a pair after this long. */
const RECHECK_WINDOW_MS = 120 * 60 * 1000;
const RECHECK_INTERVAL_MS = 60_000;
/** Bounds memory under a burst of new pairs (mirrors launch-listener.ts's seenMints cap). */
const MAX_CONCURRENT_WATCHES = 2000;

/**
 * Multi-chain early-volume scanner: watches EVM factory contracts for new
 * pairs (on any chain with a WSS RPC configured) and re-evaluates each
 * discovered pair against the fomo pipeline once a minute for the first two
 * hours after creation, then stops watching it. Detect-and-alert only —
 * never places an order or holds a wallet key (PROJECT.md hard rule 1).
 */
export class MultiChainFomoScanner {
  private readonly listeners: EvmLaunchListener[] = [];
  private readonly watchTimers = new Map<string, ReturnType<typeof setInterval>>();

  constructor(
    private readonly pipeline: FomoPipeline,
    private readonly chains: Partial<Record<EvmChain, EvmChainConfig>>,
  ) {}

  start(): void {
    for (const [chain, cfg] of Object.entries(this.chains) as [EvmChain, EvmChainConfig | undefined][]) {
      if (!cfg?.wssUrl) {
        console.warn(`[multichain-scanner] no WSS URL configured for ${chain} — live pair discovery disabled`);
        continue;
      }
      const factories: EvmFactoryConfig = {
        v2FactoryAddress: cfg.v2FactoryAddress || undefined,
        v3FactoryAddress: cfg.v3FactoryAddress || undefined,
      };
      const listener = new EvmLaunchListener(chain, cfg.wssUrl, factories, (event) => {
        this.watchPair(chain, event.pairAddress);
      });
      listener.start();
      this.listeners.push(listener);
    }
  }

  stop(): void {
    for (const listener of this.listeners) listener.stop();
    for (const timer of this.watchTimers.values()) clearInterval(timer);
    this.watchTimers.clear();
  }

  /** Exposed so tests (and a future API-driven "check this pair now" action) can trigger a watch directly. */
  watchPair(chain: EvmChain, pairAddress: string): void {
    const key = `${chain}:${pairAddress}`;
    if (this.watchTimers.has(key)) return;
    if (this.watchTimers.size >= MAX_CONCURRENT_WATCHES) {
      console.warn(`[multichain-scanner] at capacity (${MAX_CONCURRENT_WATCHES} watched pairs) — dropping ${key}`);
      return;
    }

    const startedAt = Date.now();
    const evaluate = () => {
      this.pipeline
        .evaluatePair(chain, pairAddress)
        .catch((err) => console.error(`[multichain-scanner] evaluate ${key} failed:`, err));
    };
    evaluate();

    const timer = setInterval(() => {
      if (Date.now() - startedAt > RECHECK_WINDOW_MS) {
        clearInterval(timer);
        this.watchTimers.delete(key);
        return;
      }
      evaluate();
    }, RECHECK_INTERVAL_MS);
    this.watchTimers.set(key, timer);
  }
}

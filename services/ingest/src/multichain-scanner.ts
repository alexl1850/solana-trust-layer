import { EvmLaunchListener, type EvmChain, type EvmFactoryConfig } from "@solana-trust-layer/shared";
import type { Chain } from "@solana-trust-layer/db";
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
/** DexScreener typically lags fresh Solana launches by seconds to a few minutes — retry token->pair resolution instead of giving up on the first miss. */
const TOKEN_RESOLUTION_RETRY_WINDOW_MS = 10 * 60 * 1000;
const TOKEN_RESOLUTION_RETRY_INTERVAL_MS = 30_000;

/**
 * Multi-chain early-volume scanner: watches EVM factory contracts for new
 * pairs (on any chain with a WSS RPC configured) and re-evaluates each
 * discovered pair against the fomo pipeline once a minute for the first two
 * hours after creation, then stops watching it. Solana launches come from
 * the existing Helius `LaunchListener` instead (see main.ts) — they arrive
 * as a mint address, not a DexScreener pair address, so `watchToken()`
 * resolves the pair first via the pipeline's DexScreener lookup. Detect-
 * and-alert only — never places an order or holds a wallet key (PROJECT.md
 * hard rule 1).
 */
export class MultiChainFomoScanner {
  private readonly listeners: EvmLaunchListener[] = [];
  private readonly watchTimers = new Map<string, ReturnType<typeof setInterval>>();
  private readonly tokenResolutionTimers = new Map<string, ReturnType<typeof setInterval>>();

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
    for (const timer of this.tokenResolutionTimers.values()) clearInterval(timer);
    this.tokenResolutionTimers.clear();
  }

  /**
   * Resolves a token address (e.g. a Solana mint) to its best-liquidity
   * DexScreener pair, then watches that pair. A brand-new launch often
   * isn't indexed by DexScreener yet, so this retries every 30s for up to
   * 10 minutes before giving up, rather than a single-shot lookup that
   * would silently miss most fresh Solana launches.
   */
  async watchToken(chain: Chain, tokenAddress: string): Promise<void> {
    const key = `${chain}:${tokenAddress}`;
    if (this.tokenResolutionTimers.has(key)) return;

    const tryResolve = async (): Promise<boolean> => {
      const pairAddress = await this.pipeline.resolvePairAddress(chain, tokenAddress);
      if (!pairAddress) return false;
      this.watchPair(chain, pairAddress);
      return true;
    };

    if (await tryResolve()) return;

    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - startedAt > TOKEN_RESOLUTION_RETRY_WINDOW_MS) {
        clearInterval(timer);
        this.tokenResolutionTimers.delete(key);
        return;
      }
      tryResolve()
        .then((found) => {
          if (found) {
            clearInterval(timer);
            this.tokenResolutionTimers.delete(key);
          }
        })
        .catch((err) => console.error(`[multichain-scanner] resolve token ${key} failed:`, err));
    }, TOKEN_RESOLUTION_RETRY_INTERVAL_MS);
    this.tokenResolutionTimers.set(key, timer);
  }

  /** Exposed so tests (and a future API-driven "check this pair now" action) can trigger a watch directly. */
  watchPair(chain: Chain, pairAddress: string): void {
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

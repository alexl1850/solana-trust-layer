import type { SupabaseClient } from "@supabase/supabase-js";
import type { BirdeyeClient } from "@solana-trust-layer/shared";
import type { RugAnalyser, MoonAnalyser } from "@solana-trust-layer/analysers";
import type { ClusterEngine } from "@solana-trust-layer/wallet-graph";
import type { ScoreTrigger } from "@solana-trust-layer/db";
import { combineScores } from "./scoring.js";

export interface LaunchEvent {
  mint: string;
  deployerWallet: string;
  name?: string;
  symbol?: string;
}

/**
 * Wires the ported analysers + the wallet-clustering engine into one
 * scoring pipeline (PROJECT.md Phase 2). Every call writes a `score_events`
 * row — the provable receipts log — regardless of trigger source.
 */
export class ScoringPipeline {
  constructor(
    private readonly db: SupabaseClient,
    private readonly birdeye: BirdeyeClient,
    private readonly rugAnalyser: RugAnalyser,
    private readonly moonAnalyser: MoonAnalyser,
    private readonly clusterEngine: ClusterEngine,
  ) {}

  /** New launch: walks the deployer's funding graph (expensive, only done once per token) and scores it. */
  async scoreNewLaunch(event: LaunchEvent): Promise<void> {
    const { error: tokenErr } = await this.db.from("tokens").upsert(
      {
        mint: event.mint,
        deployer_wallet: event.deployerWallet,
        name: event.name ?? null,
        symbol: event.symbol ?? null,
      },
      { onConflict: "mint", ignoreDuplicates: true },
    );
    if (tokenErr) throw new Error(`upsert token: ${tokenErr.message}`);

    const cluster = await this.clusterEngine.processNewLaunch(event.mint, event.deployerWallet);
    await this.score(event.mint, event.deployerWallet, cluster.clusterId, cluster.reputationScore, "launch");
  }

  /**
   * Recompute a score for an existing token on a live trigger (dev wallet
   * movement, LP change, volume divergence) or the 60s safety poll. Does
   * NOT re-walk the funding graph — that only happens once, at launch.
   */
  async recompute(mint: string, trigger: Exclude<ScoreTrigger, "launch">): Promise<void> {
    const { data: token, error } = await this.db
      .from("tokens")
      .select("deployer_wallet")
      .eq("mint", mint)
      .single();
    if (error || !token) throw new Error(`recompute: token ${mint} not found`);

    const { data: wallet } = await this.db
      .from("wallets")
      .select("cluster_id")
      .eq("address", token.deployer_wallet as string)
      .single();

    let reputationScore: number | null = null;
    if (wallet?.cluster_id) {
      const { data: cluster } = await this.db
        .from("clusters")
        .select("reputation_score")
        .eq("id", wallet.cluster_id as string)
        .single();
      reputationScore = (cluster?.reputation_score as number | null) ?? null;
    }

    await this.score(mint, token.deployer_wallet as string, (wallet?.cluster_id as string) ?? null, reputationScore, trigger);
  }

  private async score(
    mint: string,
    deployerWallet: string,
    clusterId: string | null,
    clusterReputationScore: number | null,
    trigger: ScoreTrigger,
  ): Promise<void> {
    const priceLiquidity = await this.birdeye.getPriceLiquidity(mint);

    const ctx = {
      mint,
      deployerWallet,
      priceLiquidity,
      launchedAt: new Date(),
      clusterReputationScore,
    };

    const [rug, moon] = await Promise.all([this.rugAnalyser.analyse(ctx), this.moonAnalyser.analyse(ctx)]);
    const final = combineScores({ rug, moon, cluster: { reputationScore: clusterReputationScore } });

    const { error } = await this.db.from("score_events").insert({
      mint,
      score: final.score,
      risk_level: final.riskLevel,
      trigger,
      signals: { rug: rug.signals, moon: moon.signals, priceLiquidity },
      cluster_id: clusterId,
    });
    if (error) throw new Error(`insert score_event: ${error.message}`);
  }
}

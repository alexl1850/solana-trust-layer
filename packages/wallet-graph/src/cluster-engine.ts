import type { SupabaseClient } from "@supabase/supabase-js";
import type { HeliusClient } from "@solana-trust-layer/shared";
import { walkFundingHistory, type FundingWalkEdge } from "./funding-walk.js";
import { computeClusterReputation, riskLevelFromScore, type ClusterStats } from "./reputation.js";

export interface ClusterResult {
  clusterId: string;
  reputationScore: number | null;
  riskLevel: ReturnType<typeof riskLevelFromScore>;
  priorRugCount: number;
  priorMoonCount: number;
  tokensLaunched: number;
  /** true when the deployer wallet had zero traceable funding history */
  unknown: boolean;
}

/**
 * Orchestrates Phase 1: given a newly-detected token launch, walks the
 * deployer wallet's funding history, merges/creates clusters in Postgres
 * (union-find persisted via wallets.cluster_id), and returns the cluster's
 * reputation so the scoring pipeline (Phase 2) can fold it into the token's
 * score. This is the only place that mutates `clusters` / `wallets.cluster_id`
 * on the live path — always called from a queue worker, never inline in an
 * API request handler (see PROJECT.md hard rule #5).
 */
export class ClusterEngine {
  constructor(
    private readonly db: SupabaseClient,
    private readonly helius: Pick<HeliusClient, "getIncomingSolTransfers" | "getApproxTransactionCount">,
  ) {}

  async processNewLaunch(mint: string, deployerWallet: string): Promise<ClusterResult> {
    await this.upsertWallet(deployerWallet);

    const walk = await walkFundingHistory(
      this.helius,
      (wallet) => this.helius.getApproxTransactionCount(wallet),
      deployerWallet,
    );

    const involvedWallets = new Set<string>([deployerWallet]);
    for (const edge of walk.edges) {
      involvedWallets.add(edge.from);
      involvedWallets.add(edge.to);
    }
    for (const w of involvedWallets) await this.upsertWallet(w);
    await this.persistEdges(walk.edges);

    const clusterId = await this.mergeClusters([...involvedWallets]);
    const stats = await this.recomputeClusterStats(clusterId, { newLaunch: true });

    return {
      clusterId,
      reputationScore: stats.reputation_score,
      riskLevel: riskLevelFromScore(stats.reputation_score),
      priorRugCount: stats.rug_count,
      priorMoonCount: stats.moon_count,
      tokensLaunched: stats.tokens_launched,
      unknown: walk.noTraceableHistory && stats.tokens_launched <= 1,
    };
  }

  private async upsertWallet(address: string): Promise<void> {
    const { error } = await this.db
      .from("wallets")
      .upsert({ address }, { onConflict: "address", ignoreDuplicates: true });
    if (error) throw new Error(`upsertWallet(${address}): ${error.message}`);
  }

  private async persistEdges(edges: FundingWalkEdge[]): Promise<void> {
    if (edges.length === 0) return;
    const rows = edges.map((e) => ({
      from_wallet: e.from,
      to_wallet: e.to,
      amount_lamports: e.lamports,
      signature: e.signature,
      slot: e.slot,
      block_time: e.blockTimeMs ? new Date(e.blockTimeMs).toISOString() : new Date().toISOString(),
      hop: e.hop,
    }));
    const { error } = await this.db
      .from("wallet_funding_edges")
      .upsert(rows, { onConflict: "signature,from_wallet,to_wallet", ignoreDuplicates: true });
    if (error) throw new Error(`persistEdges: ${error.message}`);
  }

  /**
   * Finds any existing clusters among the involved wallets and merges them
   * (union-find, persisted): the oldest cluster wins as canonical, stats are
   * summed, and every involved wallet is reassigned to it. If none of the
   * wallets belong to a cluster yet, a fresh one is created for the whole
   * group.
   */
  private async mergeClusters(wallets: string[]): Promise<string> {
    const { data: existing, error } = await this.db
      .from("wallets")
      .select("address, cluster_id")
      .in("address", wallets)
      .not("cluster_id", "is", null);
    if (error) throw new Error(`mergeClusters lookup: ${error.message}`);

    const existingClusterIds = [
      ...new Set((existing ?? []).map((w: { cluster_id: string | null }) => w.cluster_id as string)),
    ];

    let canonicalId: string;

    if (existingClusterIds.length === 0) {
      const { data: created, error: createErr } = await this.db
        .from("clusters")
        .insert({})
        .select("id")
        .single();
      if (createErr || !created) throw new Error(`create cluster: ${createErr?.message}`);
      canonicalId = created.id as string;
    } else {
      const { data: clusterRows, error: clusterErr } = await this.db
        .from("clusters")
        .select("id, rug_count, moon_count, tokens_launched, created_at")
        .in("id", existingClusterIds)
        .order("created_at", { ascending: true });
      if (clusterErr || !clusterRows?.length) throw new Error(`load clusters: ${clusterErr?.message}`);

      canonicalId = clusterRows[0]!.id as string;
      const toMerge = clusterRows.slice(1);

      if (toMerge.length > 0) {
        type ClusterRow = { rug_count: number; moon_count: number; tokens_launched: number; id: string };
        const summed = (toMerge as ClusterRow[]).reduce(
          (acc, c) => ({
            rug_count: acc.rug_count + c.rug_count,
            moon_count: acc.moon_count + c.moon_count,
            tokens_launched: acc.tokens_launched + c.tokens_launched,
          }),
          { rug_count: 0, moon_count: 0, tokens_launched: 0 },
        );

        const canonical = clusterRows[0]!;
        await this.db
          .from("clusters")
          .update({
            rug_count: (canonical.rug_count as number) + summed.rug_count,
            moon_count: (canonical.moon_count as number) + summed.moon_count,
            tokens_launched: (canonical.tokens_launched as number) + summed.tokens_launched,
            updated_at: new Date().toISOString(),
          })
          .eq("id", canonicalId);

        const mergedIds = (toMerge as Array<{ id: string }>).map((c) => c.id);
        await this.db.from("wallets").update({ cluster_id: canonicalId }).in("cluster_id", mergedIds);
        await this.db.from("clusters").delete().in("id", mergedIds);
      }
    }

    await this.db.from("wallets").update({ cluster_id: canonicalId }).in("address", wallets);
    return canonicalId;
  }

  /**
   * Called when a token's outcome resolves (rug/moon confirmed — see
   * packages/analysers PatternStore.recordOutcome) to fold that outcome
   * into its deployer's cluster reputation. This is what makes
   * "cluster has N prior rugs" actually accumulate over time, and what the
   * backtest report (services/ingest/src/backtest.ts) measures.
   */
  async recordOutcome(deployerWallet: string, outcome: "rug" | "moon"): Promise<void> {
    const { data: wallet, error } = await this.db
      .from("wallets")
      .select("cluster_id")
      .eq("address", deployerWallet)
      .single();
    if (error || !wallet?.cluster_id) return; // no cluster yet (shouldn't happen post-launch, but don't throw)

    const clusterId = wallet.cluster_id as string;
    const { data: cluster, error: clusterErr } = await this.db
      .from("clusters")
      .select("rug_count, moon_count")
      .eq("id", clusterId)
      .single();
    if (clusterErr || !cluster) throw new Error(`recordOutcome load cluster: ${clusterErr?.message}`);

    await this.db
      .from("clusters")
      .update({
        rug_count: (cluster.rug_count as number) + (outcome === "rug" ? 1 : 0),
        moon_count: (cluster.moon_count as number) + (outcome === "moon" ? 1 : 0),
        updated_at: new Date().toISOString(),
      })
      .eq("id", clusterId);

    await this.recomputeClusterStats(clusterId, { newLaunch: false });
  }

  private async recomputeClusterStats(
    clusterId: string,
    opts: { newLaunch: boolean },
  ): Promise<{
    rug_count: number;
    moon_count: number;
    tokens_launched: number;
    reputation_score: number | null;
  }> {
    const { data: cluster, error } = await this.db
      .from("clusters")
      .select("rug_count, moon_count, tokens_launched, last_launch_at")
      .eq("id", clusterId)
      .single();
    if (error || !cluster) throw new Error(`recomputeClusterStats: ${error?.message}`);

    const tokensLaunched = (cluster.tokens_launched as number) + (opts.newLaunch ? 1 : 0);
    const now = new Date();
    const lastLaunchAt = cluster.last_launch_at ? new Date(cluster.last_launch_at as string) : null;

    const stats: ClusterStats = {
      rugCount: cluster.rug_count as number,
      moonCount: cluster.moon_count as number,
      tokensLaunched,
      msSinceLastLaunch: lastLaunchAt ? now.getTime() - lastLaunchAt.getTime() : null,
    };

    const reputationScore = computeClusterReputation(stats);

    await this.db
      .from("clusters")
      .update({
        tokens_launched: tokensLaunched,
        reputation_score: reputationScore,
        last_launch_at: opts.newLaunch ? now.toISOString() : cluster.last_launch_at,
        updated_at: now.toISOString(),
      })
      .eq("id", clusterId);

    return {
      rug_count: stats.rugCount,
      moon_count: stats.moonCount,
      tokens_launched: tokensLaunched,
      reputation_score: reputationScore,
    };
  }
}

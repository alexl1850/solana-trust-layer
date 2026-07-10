import { createClient } from "@supabase/supabase-js";
import { loadConfig } from "@solana-trust-layer/shared";

/**
 * PROJECT.md Phase 1 acceptance criterion: "Backtest: run against
 * patternStore's historical labeled rugs; report what % of rugs came from
 * clusters with ≥1 prior rug (this becomes our launch marketing stat)."
 *
 * A rugged token's cluster having rug_count >= 2 means at least one OTHER
 * rug is attributed to the same cluster (the current token is already
 * counted in rug_count once it's resolved).
 */
async function main() {
  const config = loadConfig();
  const db = createClient(config.db.supabaseUrl, config.db.supabaseServiceRoleKey);

  const { data: ruggedTokens, error } = await db
    .from("tokens")
    .select("mint, deployer_wallet, wallets!inner(cluster_id)")
    .eq("outcome", "rug");
  if (error) throw new Error(`backtest query: ${error.message}`);

  const clusterIds = [
    ...new Set(
      (ruggedTokens ?? [])
        .map((t: any) => t.wallets?.cluster_id as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const { data: clusters, error: clusterErr } = clusterIds.length
    ? await db.from("clusters").select("id, rug_count").in("id", clusterIds)
    : { data: [], error: null };
  if (clusterErr) throw new Error(`backtest cluster query: ${clusterErr.message}`);

  const rugCountByCluster = new Map<string, number>(
    (clusters ?? []).map((c: any) => [c.id as string, c.rug_count as number]),
  );

  const total = ruggedTokens?.length ?? 0;
  let fromRepeatOffenders = 0;

  for (const token of ruggedTokens ?? []) {
    const clusterId = (token as any).wallets?.cluster_id as string | null;
    const rugCount = clusterId ? (rugCountByCluster.get(clusterId) ?? 0) : 0;
    if (rugCount >= 2) fromRepeatOffenders += 1;
  }

  const pct = total === 0 ? 0 : Math.round((fromRepeatOffenders / total) * 10000) / 100;

  console.log(`Backtest report — historical labeled rugs`);
  console.log(`  Total rugged tokens:                 ${total}`);
  console.log(`  From clusters with >=1 prior rug:     ${fromRepeatOffenders}`);
  console.log(`  Percentage:                           ${pct}%`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

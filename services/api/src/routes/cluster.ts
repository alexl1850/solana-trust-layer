import type { FastifyInstance } from "fastify";
import type { SupabaseClient } from "@supabase/supabase-js";

export function registerClusterRoutes(app: FastifyInstance, deps: { db: SupabaseClient }): void {
  app.get("/v1/cluster/:deployerWallet", async (request, reply) => {
    const { deployerWallet } = request.params as { deployerWallet: string };

    const { data: wallet } = await deps.db
      .from("wallets")
      .select("cluster_id")
      .eq("address", deployerWallet)
      .single();

    const clusterId = (wallet as { cluster_id: string | null } | null)?.cluster_id ?? null;
    if (!clusterId) {
      // No traceable funding history — UNKNOWN is itself a risk signal, not an error.
      return reply.send({ deployerWallet, cluster: null, unknown: true });
    }

    const { data: cluster, error } = await deps.db.from("clusters").select("*").eq("id", clusterId).single();
    if (error || !cluster) return reply.code(404).send({ error: "cluster not found" });

    return { deployerWallet, cluster, unknown: false };
  });
}

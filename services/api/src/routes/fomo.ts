import type { FastifyInstance } from "fastify";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface FomoRouteDeps {
  db: SupabaseClient;
}

const VALID_CHAINS = new Set(["solana", "ethereum", "base", "bsc"]);

/**
 * Multi-chain early-volume / pre-FOMO alert feed (PROJECT.md's widened
 * scope — detect-and-alert only, see hard rule 1: this never places an
 * order). Public like `/v1/feed`: a heuristic candidate list, not a
 * personalized recommendation, so no tier-gating beyond the page-size cap.
 */
export function registerFomoRoutes(app: FastifyInstance, deps: FomoRouteDeps): void {
  app.get("/v1/fomo/feed", async (request, reply) => {
    const query = request.query as { limit?: string; chain?: string };
    const limit = Math.min(Number(query.limit ?? 50) || 50, 100);

    let builder = deps.db
      .from("fomo_events")
      .select("chain, token_address, pair_address, dex_id, symbol, name, fomo_score, pair_created_at, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (query.chain) {
      if (!VALID_CHAINS.has(query.chain)) {
        return reply.code(400).send({ error: `unsupported chain, expected one of: ${[...VALID_CHAINS].join(", ")}` });
      }
      builder = builder.eq("chain", query.chain);
    }

    const { data, error } = await builder;
    if (error) return reply.code(500).send({ error: error.message });

    return { events: data ?? [] };
  });

  app.get("/v1/fomo/:chain/:pairAddress", async (request, reply) => {
    const { chain, pairAddress } = request.params as { chain: string; pairAddress: string };
    if (!VALID_CHAINS.has(chain)) {
      return reply.code(400).send({ error: `unsupported chain, expected one of: ${[...VALID_CHAINS].join(", ")}` });
    }

    const { data, error } = await deps.db
      .from("fomo_events")
      .select("*")
      .eq("chain", chain)
      .eq("pair_address", pairAddress)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (error || !data) return reply.code(404).send({ error: "no fomo alert for this pair yet" });

    return data;
  });
}

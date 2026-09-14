import type { FastifyInstance } from "fastify";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface FomoRouteDeps {
  db: SupabaseClient;
}

const VALID_CHAINS = new Set(["solana", "ethereum", "base", "bsc"]);
/** Ordered low-to-high; `unknown` is deliberately excluded from ranking — a missing/absent signal is never treated as "safer than low" (hard rule 2). */
const RUG_RISK_ORDER = ["low", "medium", "high", "critical"] as const;

/**
 * Multi-chain early-volume / pre-FOMO alert feed (PROJECT.md's widened
 * scope — detect-and-alert only, see hard rule 1: this never places an
 * order). Public like `/v1/feed`: a heuristic candidate list, not a
 * personalized recommendation, so no tier-gating beyond the page-size cap.
 *
 * Every alert carries `rug_risk_level` alongside `fomo_score` (see
 * fomo-pipeline.ts): Solana's is backed by the real trained rugAnalyser via
 * score_events, other chains get the chain-agnostic divergence heuristic.
 * `?maxRugRisk=` filters the feed down to alerts at or below a risk level.
 */
export function registerFomoRoutes(app: FastifyInstance, deps: FomoRouteDeps): void {
  app.get("/v1/fomo/feed", async (request, reply) => {
    const query = request.query as { limit?: string; chain?: string; maxRugRisk?: string };
    const limit = Math.min(Number(query.limit ?? 50) || 50, 100);

    let builder = deps.db
      .from("fomo_events")
      .select(
        "chain, token_address, pair_address, dex_id, symbol, name, fomo_score, rug_risk_level, pair_created_at, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (query.chain) {
      if (!VALID_CHAINS.has(query.chain)) {
        return reply.code(400).send({ error: `unsupported chain, expected one of: ${[...VALID_CHAINS].join(", ")}` });
      }
      builder = builder.eq("chain", query.chain);
    }

    if (query.maxRugRisk) {
      const rank = RUG_RISK_ORDER.indexOf(query.maxRugRisk as (typeof RUG_RISK_ORDER)[number]);
      if (rank === -1) {
        return reply
          .code(400)
          .send({ error: `unsupported maxRugRisk, expected one of: ${RUG_RISK_ORDER.join(", ")}` });
      }
      const allowed = RUG_RISK_ORDER.slice(0, rank + 1);
      // Unknown/null is never filtered out by a risk ceiling — it means "no signal fired yet", not "safe".
      builder = builder.or(`rug_risk_level.is.null,rug_risk_level.eq.unknown,rug_risk_level.in.(${allowed.join(",")})`);
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

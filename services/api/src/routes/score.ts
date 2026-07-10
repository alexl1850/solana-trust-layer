import type { FastifyInstance } from "fastify";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getUserTier } from "../tier-lookup.js";
import { TierRateLimiter } from "../rate-limit.js";

export interface ScoreRouteDeps {
  db: SupabaseClient;
  rateLimiter: TierRateLimiter;
}

export function registerScoreRoutes(app: FastifyInstance, deps: ScoreRouteDeps): void {
  app.get("/v1/score/:mint", async (request, reply) => {
    const { mint } = request.params as { mint: string };
    const tier = request.user ? await getUserTier(deps.db, request.user.userId) : "free";
    const identity = request.user?.userId ?? request.ip;

    const rateCheck = await deps.rateLimiter.checkScoreLookup(identity, tier);
    if (!rateCheck.allowed) {
      return reply.code(429).send({ error: "daily score lookup limit reached for your tier", tier });
    }

    const { data, error } = await deps.db
      .from("score_events")
      .select("*")
      .eq("mint", mint)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (error || !data) return reply.code(404).send({ error: "no score for this mint yet" });

    const event = data as {
      score: number | null;
      risk_level: string;
      created_at: string;
      cluster_id: string | null;
    };

    const basic = { mint, score: event.score, riskLevel: event.risk_level, scoredAt: event.created_at };

    // Free tier: basic score only, no cluster detail (PROJECT.md Phase 3 tiers table).
    if (tier === "free") return basic;

    let cluster: unknown = null;
    if (event.cluster_id) {
      const { data: clusterRow } = await deps.db.from("clusters").select("*").eq("id", event.cluster_id).single();
      cluster = clusterRow;
    }

    return { ...basic, cluster };
  });

  app.get("/v1/score/:mint/history", async (request, reply) => {
    const { mint } = request.params as { mint: string };
    const { data, error } = await deps.db
      .from("score_events")
      .select("score, risk_level, trigger, created_at")
      .eq("mint", mint)
      .order("created_at", { ascending: true });
    if (error) return reply.code(500).send({ error: error.message });

    return { mint, history: data ?? [] };
  });

  // The "watch the firehose" feed (PROJECT.md Phase 4 Live feed page) — most recent launch scores across all mints.
  app.get("/v1/feed", async (request, reply) => {
    const limit = Math.min(Number((request.query as { limit?: string }).limit ?? 50), 100);
    const { data, error } = await deps.db
      .from("score_events")
      .select("mint, score, risk_level, trigger, created_at")
      .eq("trigger", "launch")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return reply.code(500).send({ error: error.message });

    return { events: data ?? [] };
  });
}

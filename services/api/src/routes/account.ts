import type { FastifyInstance } from "fastify";
import type { SupabaseClient } from "@supabase/supabase-js";

export function registerAccountRoutes(app: FastifyInstance, deps: { db: SupabaseClient }): void {
  app.get("/v1/account", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "unauthenticated" });

    const { data, error } = await deps.db
      .from("users")
      .select("wallet_address, tier, token_balance, balance_checked_at, grace_period_started_at")
      .eq("id", request.user.userId)
      .single();
    if (error || !data) return reply.code(404).send({ error: "user not found" });

    return data;
  });
}

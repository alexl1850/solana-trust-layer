import type { FastifyInstance } from "fastify";
import type { SupabaseClient } from "@supabase/supabase-js";

export function registerReceiptsRoutes(app: FastifyInstance, deps: { db: SupabaseClient }): void {
  app.get("/v1/receipts", async (_request, reply) => {
    const { data, error } = await deps.db
      .from("receipts")
      .select("*")
      .order("period_start", { ascending: false })
      .limit(50);
    if (error) return reply.code(500).send({ error: error.message });

    return { receipts: data ?? [] };
  });

  app.get("/v1/receipts/:merkleRoot", async (request, reply) => {
    const { merkleRoot } = request.params as { merkleRoot: string };
    const { data, error } = await deps.db.from("receipts").select("*").eq("merkle_root", merkleRoot).single();
    if (error || !data) return reply.code(404).send({ error: "receipt not found" });

    return data;
  });
}

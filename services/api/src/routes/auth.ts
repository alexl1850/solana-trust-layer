import type { FastifyInstance } from "fastify";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateNonce, buildSignMessage } from "../nonce.js";
import { verifyWalletSignature } from "../signature.js";
import { issueJwt } from "../jwt.js";

export interface AuthRouteDeps {
  db: SupabaseClient;
  jwtSecret: string;
  jwtExpiry: string;
  nonceTtlSeconds: number;
}

export function registerAuthRoutes(app: FastifyInstance, deps: AuthRouteDeps): void {
  app.post("/v1/auth/nonce", async (request, reply) => {
    const { wallet } = request.body as { wallet?: string };
    if (!wallet) return reply.code(400).send({ error: "wallet is required" });

    const nonce = generateNonce();
    const expiresAt = new Date(Date.now() + deps.nonceTtlSeconds * 1000);

    const { error } = await deps.db
      .from("auth_nonces")
      .upsert({ wallet_address: wallet, nonce, expires_at: expiresAt.toISOString() });
    if (error) return reply.code(500).send({ error: error.message });

    return { message: buildSignMessage(nonce), expiresAt: expiresAt.toISOString() };
  });

  app.post("/v1/auth/verify", async (request, reply) => {
    const { wallet, signature } = request.body as { wallet?: string; signature?: string };
    if (!wallet || !signature) return reply.code(400).send({ error: "wallet and signature are required" });

    const { data: nonceRow, error: nonceErr } = await deps.db
      .from("auth_nonces")
      .select("nonce, expires_at")
      .eq("wallet_address", wallet)
      .single();
    if (nonceErr || !nonceRow) return reply.code(400).send({ error: "no nonce issued for this wallet" });

    const row = nonceRow as { nonce: string; expires_at: string };
    if (new Date(row.expires_at) < new Date()) {
      return reply.code(400).send({ error: "nonce expired, request a new one" });
    }

    const message = buildSignMessage(row.nonce);
    if (!verifyWalletSignature(wallet, message, signature)) {
      return reply.code(401).send({ error: "invalid signature" });
    }

    await deps.db.from("auth_nonces").delete().eq("wallet_address", wallet);

    const { data: existingUser } = await deps.db
      .from("users")
      .select("id, tier")
      .eq("wallet_address", wallet)
      .single();

    let userId: string;
    let tier: string;

    if (existingUser) {
      userId = (existingUser as { id: string }).id;
      tier = (existingUser as { tier: string }).tier;
    } else {
      const { data: created, error: createErr } = await deps.db
        .from("users")
        .insert({ wallet_address: wallet })
        .select("id, tier")
        .single();
      if (createErr || !created) return reply.code(500).send({ error: createErr?.message ?? "failed to create user" });
      userId = (created as { id: string }).id;
      tier = (created as { tier: string }).tier;
    }

    const token = issueJwt({ sub: userId, wallet }, deps.jwtSecret, deps.jwtExpiry);
    return { token, tier };
  });
}

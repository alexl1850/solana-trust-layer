import type { FastifyRequest, FastifyReply } from "fastify";
import { verifyJwt } from "./jwt.js";

export interface AuthedUser {
  userId: string;
  wallet: string;
}

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthedUser;
  }
}

/**
 * Extracts and verifies the bearer JWT, attaching `request.user` if valid.
 * Does NOT reject unauthenticated requests itself — routes decide whether
 * `free`-tier (unauthenticated) access is acceptable, since e.g. the score
 * endpoint allows anonymous free-tier lookups up to the daily cap.
 */
export function createAuthHook(jwtSecret: string) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) return;

    const token = header.slice("Bearer ".length);
    const payload = verifyJwt(token, jwtSecret);
    if (payload) {
      request.user = { userId: payload.sub, wallet: payload.wallet };
    }
  };
}

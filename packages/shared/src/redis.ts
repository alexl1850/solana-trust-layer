import { Redis } from "ioredis";

let cached: Redis | null = null;

export function getRedisClient(url: string): Redis {
  if (cached) return cached;
  cached = new Redis(url);
  return cached;
}

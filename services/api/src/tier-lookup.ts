import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserTier } from "@solana-trust-layer/db";

export async function getUserTier(db: SupabaseClient, userId: string): Promise<UserTier> {
  const { data } = await db.from("users").select("tier").eq("id", userId).single();
  return ((data as { tier: UserTier } | null)?.tier ?? "free") as UserTier;
}

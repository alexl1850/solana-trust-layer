import cron from "node-cron";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { HeliusClient } from "@solana-trust-layer/shared";
import { resolveTier } from "./tiers.js";

export interface BalanceRecheckOptions {
  tokenMint: string;
  holderMinBalance: bigint;
  apiProMinBalance: bigint;
  gracePeriodHours: number;
  intervalHours: number;
}

/**
 * Runs every `intervalHours` (default 8, PROJECT.md Phase 3): re-checks
 * every user's on-chain balance of the trust token and re-derives their
 * tier via `resolveTier`, including the 24h grace-period logic.
 */
export function scheduleBalanceRecheck(
  db: SupabaseClient,
  helius: Pick<HeliusClient, "getTokenBalance">,
  opts: BalanceRecheckOptions,
): void {
  const cronExpr = `0 */${opts.intervalHours} * * *`;
  cron.schedule(cronExpr, () => {
    runBalanceRecheck(db, helius, opts).catch((err) => console.error("[balance-recheck] failed:", err));
  });
}

export async function runBalanceRecheck(
  db: SupabaseClient,
  helius: Pick<HeliusClient, "getTokenBalance">,
  opts: BalanceRecheckOptions,
): Promise<void> {
  if (!opts.tokenMint) {
    console.warn("[balance-recheck] TRUST_TOKEN_MINT not set, skipping");
    return;
  }

  const { data: users, error } = await db
    .from("users")
    .select("id, wallet_address, tier, grace_period_started_at, stripe_customer_id");
  if (error) throw new Error(`balance-recheck load users: ${error.message}`);

  const now = new Date();

  for (const user of users ?? []) {
    const row = user as {
      id: string;
      wallet_address: string;
      tier: "free" | "paid" | "holder" | "api_pro";
      grace_period_started_at: string | null;
      stripe_customer_id: string | null;
    };

    try {
      const balance = await helius.getTokenBalance(row.wallet_address, opts.tokenMint);
      const resolved = resolveTier({
        currentTier: row.tier,
        tokenBalance: balance,
        holderMinBalance: opts.holderMinBalance,
        apiProMinBalance: opts.apiProMinBalance,
        hasActiveSubscription: Boolean(row.stripe_customer_id),
        gracePeriodStartedAt: row.grace_period_started_at ? new Date(row.grace_period_started_at) : null,
        gracePeriodHours: opts.gracePeriodHours,
        now,
      });

      await db
        .from("users")
        .update({
          tier: resolved.tier,
          // sent as a string so PostgREST/pg parses it as bigint without precision loss through JSON
          token_balance: balance.toString(),
          balance_checked_at: now.toISOString(),
          grace_period_started_at: resolved.gracePeriodStartedAt?.toISOString() ?? null,
          updated_at: now.toISOString(),
        })
        .eq("id", row.id);
    } catch (err) {
      console.error(`[balance-recheck] failed for user ${row.id}:`, err);
    }
  }
}

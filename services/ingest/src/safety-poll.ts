import type { SupabaseClient } from "@supabase/supabase-js";
import type { ScoringPipeline } from "./pipeline.js";

const SAFETY_POLL_INTERVAL_MS = 60_000;
/** A token counts as "actively watched" for the first 24h after launch — matches the live feed's default window. */
const ACTIVE_WINDOW_HOURS = 24;

/**
 * 60s safety poll (PROJECT.md Phase 2): scores recompute on live events by
 * default, but every actively-watched token also gets a floor-level
 * recompute every 60s in case an event was missed (dropped websocket
 * message, etc).
 */
export class SafetyPoll {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly db: SupabaseClient,
    private readonly pipeline: ScoringPipeline,
  ) {}

  start(): void {
    this.timer = setInterval(() => {
      this.tick().catch((err) => console.error("[safety-poll] tick failed:", err));
    }, SAFETY_POLL_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    const since = new Date(Date.now() - ACTIVE_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
    const { data: tokens, error } = await this.db
      .from("tokens")
      .select("mint")
      .gte("launched_at", since)
      .eq("outcome", "unresolved");
    if (error) {
      console.error("[safety-poll] failed to list active tokens:", error.message);
      return;
    }

    for (const { mint } of tokens ?? []) {
      try {
        await this.pipeline.recompute(mint as string, "safety_poll");
      } catch (err) {
        console.error(`[safety-poll] recompute failed for ${mint}:`, err);
      }
    }
  }
}

export interface LabeledOutcome {
  mint: string;
  deployerWallet: string;
  outcome: "rug" | "moon";
  resolvedAt: Date;
  details: Record<string, unknown>;
}

export interface PatternStore {
  getLabeledOutcomes(): Promise<LabeledOutcome[]>;
  recordOutcome(outcome: LabeledOutcome): Promise<void>;
}

/**
 * PORT TARGET: `patternStore` from the source bot — the labeled outcome
 * history (which tokens rugged, which mooned) used both to train the
 * analysers and, per PROJECT.md Phase 1 acceptance criteria, to backtest
 * the wallet-clustering engine ("what % of rugs came from clusters with
 * ≥1 prior rug").
 *
 * Target storage: the `tokens` table (`outcome`, `outcome_resolved_at`,
 * `outcome_details` columns) in packages/db, not a separate store — the
 * source bot's patternStore file becomes the seed data to backfill from,
 * not a service to keep running.
 *
 * SupabasePatternStore below is the real, working implementation (reads/
 * writes packages/db); it just has no rows until the source data is
 * backfilled.
 */
export class SupabasePatternStore implements PatternStore {
  constructor(
    private readonly db: {
      from: (table: string) => {
        select: (cols: string) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
        insert: (row: unknown) => Promise<{ error: { message: string } | null }>;
      };
    },
  ) {}

  async getLabeledOutcomes(): Promise<LabeledOutcome[]> {
    const { data, error } = await this.db
      .from("tokens")
      .select("mint, deployer_wallet, outcome, outcome_resolved_at, outcome_details");
    if (error) throw new Error(`getLabeledOutcomes: ${error.message}`);

    return (data ?? [])
      .filter((row): row is Record<string, unknown> => {
        const outcome = (row as Record<string, unknown>).outcome;
        return outcome === "rug" || outcome === "moon";
      })
      .map((row) => ({
        mint: row.mint as string,
        deployerWallet: row.deployer_wallet as string,
        outcome: row.outcome as "rug" | "moon",
        resolvedAt: new Date(row.outcome_resolved_at as string),
        details: (row.outcome_details as Record<string, unknown>) ?? {},
      }));
  }

  async recordOutcome(outcome: LabeledOutcome): Promise<void> {
    const { error } = await this.db.from("tokens").insert({
      mint: outcome.mint,
      deployer_wallet: outcome.deployerWallet,
      outcome: outcome.outcome,
      outcome_resolved_at: outcome.resolvedAt.toISOString(),
      outcome_details: outcome.details,
    });
    if (error) throw new Error(`recordOutcome: ${error.message}`);
  }
}

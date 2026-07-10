import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Ported from the source bot's `patternStore.ts` (rug side) / `moonStore.ts`
 * (moon side). Backed by the `learned_patterns` table instead of a local
 * JSON file — seeded from the same real trained data (87 labeled rugs, 100
 * labeled moons) the source bot had accumulated.
 */
export class LearnedPatternsStore {
  constructor(private readonly db: SupabaseClient) {}

  private async weightsFor(ids: string[], kind: "rug" | "moon"): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();
    const { data, error } = await this.db
      .from("learned_patterns")
      .select("id, weight")
      .eq("kind", kind)
      .in("id", ids);
    if (error) throw new Error(`learned_patterns lookup: ${error.message}`);
    return new Map((data ?? []).map((row: any) => [row.id as string, row.weight as number]));
  }

  /** 0-20: score penalty from learned rug patterns present in this token. */
  async learnedPenalty(patternIds: string[]): Promise<number> {
    const weights = await this.weightsFor(patternIds, "rug");
    let penalty = 0;
    for (const id of patternIds) {
      const weight = weights.get(id);
      if (weight === undefined) continue;
      if (weight > 0.6) penalty += weight * 8;
      else if (weight > 0.4) penalty += weight * 4;
    }
    return Math.min(penalty, 20);
  }

  /** 0-15: score bonus from learned moon patterns present in this token. */
  async moonBonus(patternIds: string[]): Promise<number> {
    const weights = await this.weightsFor(patternIds, "moon");
    let bonus = 0;
    for (const id of patternIds) {
      const weight = weights.get(id);
      if (weight === undefined) continue;
      if (weight > 0.65) bonus += weight * 6;
      else if (weight > 0.5) bonus += weight * 3;
    }
    return Math.min(bonus, 15);
  }
}

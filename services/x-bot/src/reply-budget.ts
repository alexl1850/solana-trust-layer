export interface MentionCandidate {
  mint: string;
  /** mentions of this mint in the recent window — used to prioritize under budget pressure */
  mentionVelocity: number;
}

export interface BudgetState {
  repliesUsedToday: number;
  dailyBudget: number;
}

const NEAR_CAP_THRESHOLD = 0.9;

/** True once daily usage crosses 90% of budget — triggers prioritization. */
export function isNearingCap(state: BudgetState): boolean {
  if (state.dailyBudget <= 0) return true;
  return state.repliesUsedToday / state.dailyBudget >= NEAR_CAP_THRESHOLD;
}

/**
 * PROJECT.md Phase 5: "if nearing cap, prioritize replies on tokens with
 * high mention velocity." Below the threshold, every candidate proceeds;
 * once nearing the cap, only the top `topFraction` by velocity do.
 */
export function selectPrioritized(
  candidates: MentionCandidate[],
  state: BudgetState,
  topFraction = 0.2,
): MentionCandidate[] {
  if (!isNearingCap(state)) return candidates;
  if (candidates.length === 0) return candidates;

  const sorted = [...candidates].sort((a, b) => b.mentionVelocity - a.mentionVelocity);
  const cutoff = Math.max(1, Math.ceil(sorted.length * topFraction));
  return sorted.slice(0, cutoff);
}

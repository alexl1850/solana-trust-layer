export interface LastReply {
  riskLevel: string;
  repliedAt: Date;
}

const DEDUPE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/**
 * PROJECT.md Phase 5: "one reply per token per hour max unless score
 * changes risk level." Pure decision function — the caller supplies the
 * last reply for this mint (if any) from whatever store it uses.
 */
export function shouldReply(lastReply: LastReply | null, currentRiskLevel: string, now: Date): boolean {
  if (!lastReply) return true;
  if (lastReply.riskLevel !== currentRiskLevel) return true;
  return now.getTime() - lastReply.repliedAt.getTime() >= DEDUPE_WINDOW_MS;
}

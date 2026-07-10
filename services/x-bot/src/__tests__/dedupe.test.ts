import { describe, expect, it } from "vitest";
import { shouldReply } from "../dedupe.js";

describe("shouldReply", () => {
  const now = new Date("2026-01-01T12:00:00Z");

  it("replies when there's no prior reply for this mint", () => {
    expect(shouldReply(null, "high", now)).toBe(true);
  });

  it("does not reply again within the hour at the same risk level", () => {
    const lastReply = { riskLevel: "high", repliedAt: new Date("2026-01-01T11:30:00Z") };
    expect(shouldReply(lastReply, "high", now)).toBe(false);
  });

  it("replies immediately if the risk level changed, even within the hour", () => {
    const lastReply = { riskLevel: "medium", repliedAt: new Date("2026-01-01T11:59:00Z") };
    expect(shouldReply(lastReply, "critical", now)).toBe(true);
  });

  it("replies again once the hour has elapsed at the same risk level", () => {
    const lastReply = { riskLevel: "high", repliedAt: new Date("2026-01-01T10:59:59Z") };
    expect(shouldReply(lastReply, "high", now)).toBe(true);
  });
});

export interface RiskMeta {
  color: string;
  label: string;
}

/** Single source of truth for risk-level color/label — keeps the gauge and badge in sync. */
export const RISK_META: Record<string, RiskMeta> = {
  unknown: { color: "var(--status-unknown)", label: "Unknown" },
  low: { color: "var(--status-good)", label: "Low risk" },
  medium: { color: "var(--status-warning)", label: "Medium risk" },
  high: { color: "var(--status-serious)", label: "High risk" },
  critical: { color: "var(--status-critical)", label: "Critical" },
};

export function riskMeta(riskLevel: string): RiskMeta {
  return RISK_META[riskLevel] ?? RISK_META.unknown!;
}

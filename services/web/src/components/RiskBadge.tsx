const RISK_META: Record<string, { color: string; icon: string; label: string }> = {
  unknown: { color: "var(--status-unknown)", icon: "?", label: "Unknown" },
  low: { color: "var(--status-good)", icon: "✓", label: "Low risk" },
  medium: { color: "var(--status-warning)", icon: "!", label: "Medium risk" },
  high: { color: "var(--status-serious)", icon: "!!", label: "High risk" },
  critical: { color: "var(--status-critical)", icon: "✕", label: "Critical" },
};

export function RiskBadge({ riskLevel }: { riskLevel: string }) {
  const meta = RISK_META[riskLevel] ?? RISK_META.unknown!;
  return (
    <span className="risk-badge" style={{ color: meta.color, borderColor: meta.color }}>
      <span aria-hidden="true">{meta.icon}</span>
      {meta.label}
    </span>
  );
}

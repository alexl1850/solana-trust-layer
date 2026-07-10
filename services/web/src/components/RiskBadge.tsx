import { riskMeta } from "../risk-colors.js";

export function RiskBadge({ riskLevel }: { riskLevel: string }) {
  const meta = riskMeta(riskLevel);
  return (
    <span className="risk-badge" style={{ color: meta.color }}>
      <span className="dot" aria-hidden="true" />
      {meta.label}
    </span>
  );
}

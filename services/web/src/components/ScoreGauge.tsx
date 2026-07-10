import { riskMeta } from "../risk-colors.js";

interface ScoreGaugeProps {
  score: number | null;
  riskLevel: string;
  size?: number;
}

export function ScoreGauge({ score, riskLevel, size = 132 }: ScoreGaugeProps) {
  const strokeWidth = 11;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = score !== null ? Math.max(0, Math.min(100, score)) / 100 : 0;
  const dash = circumference * pct;
  const color = riskMeta(riskLevel).color;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Score ${score ?? "unknown"} out of 100`}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--gridline)" strokeWidth={strokeWidth} />
      {score !== null && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={`${dash} ${circumference - dash}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dasharray 0.4s ease", filter: `drop-shadow(0 0 6px ${color})` }}
        />
      )}
      <text
        x="50%"
        y="49%"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={size * 0.27}
        fontWeight={700}
        fill="var(--text-primary)"
        fontFamily="var(--mono)"
      >
        {score !== null ? Math.round(score) : "—"}
      </text>
      <text
        x="50%"
        y="72%"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={size * 0.075}
        fill="var(--text-muted)"
        fontFamily="var(--sans)"
        style={{ textTransform: "uppercase", letterSpacing: "0.06em" }}
      >
        / 100
      </text>
    </svg>
  );
}

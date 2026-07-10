interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
}

/** Score-over-time trend line with a soft gradient fill. Single series — no legend needed, title names it. */
export function Sparkline({ values, width = 280, height = 64 }: SparklineProps) {
  if (values.length < 2) {
    return <div className="muted">Not enough history yet</div>;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);
  const pad = 4;
  const plotHeight = height - pad * 2;

  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = pad + plotHeight - ((v - min) / range) * plotHeight;
    return { x, y };
  });

  const line = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `0,${height} ${line} ${width},${height}`;
  const last = values[values.length - 1]!;
  const gradientId = "sparkline-fill";

  return (
    <svg width={width} height={height} role="img" aria-label={`Score trend, currently ${last.toFixed(0)}`}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gradientId})`} />
      <polyline
        points={line}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={2} fill="transparent">
          <title>{values[i]!.toFixed(1)}</title>
        </circle>
      ))}
    </svg>
  );
}

interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
}

/** Minimal score-over-time trend line. Single series — no legend needed, title names it. */
export function Sparkline({ values, width = 240, height = 48 }: SparklineProps) {
  if (values.length < 2) {
    return <div className="muted">Not enough history yet</div>;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);

  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const last = values[values.length - 1]!;

  return (
    <svg width={width} height={height} role="img" aria-label={`Score trend, currently ${last.toFixed(0)}`}>
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {values.map((v, i) => (
        <circle key={i} cx={i * stepX} cy={height - ((v - min) / range) * height} r={2} fill="transparent">
          <title>{v.toFixed(1)}</title>
        </circle>
      ))}
    </svg>
  );
}

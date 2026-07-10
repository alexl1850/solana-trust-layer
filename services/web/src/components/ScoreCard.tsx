import { RiskBadge } from "./RiskBadge.js";
import { Sparkline } from "./Sparkline.js";
import type { ScoreResponse, ScoreHistoryEntry } from "../api.js";

export function ScoreCard({ score, history }: { score: ScoreResponse; history: ScoreHistoryEntry[] }) {
  const trend = history.map((h) => h.score).filter((s): s is number => s !== null);

  return (
    <div className="card">
      <div className="muted">{score.mint}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginTop: 8 }}>
        <div className="score-hero">{score.score !== null ? score.score.toFixed(0) : "—"}</div>
        <RiskBadge riskLevel={score.riskLevel} />
      </div>

      {score.cluster ? (
        <div style={{ marginTop: 16 }}>
          <div className="muted">Deployer cluster history</div>
          <div>
            {score.cluster.tokens_launched} launch{score.cluster.tokens_launched === 1 ? "" : "es"} ·{" "}
            {score.cluster.rug_count} rug{score.cluster.rug_count === 1 ? "" : "s"} · {score.cluster.moon_count} moon
            {score.cluster.moon_count === 1 ? "" : "s"}
          </div>
        </div>
      ) : score.cluster === null ? (
        <div style={{ marginTop: 16 }} className="muted">
          Upgrade for full cluster history detail.
        </div>
      ) : null}

      {trend.length > 1 && (
        <div style={{ marginTop: 16 }}>
          <div className="muted">Score over time</div>
          <Sparkline values={trend} />
        </div>
      )}
    </div>
  );
}

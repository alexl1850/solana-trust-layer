import { RiskBadge } from "./RiskBadge.js";
import { ScoreGauge } from "./ScoreGauge.js";
import { Sparkline } from "./Sparkline.js";
import type { ScoreResponse, ScoreHistoryEntry } from "../api.js";

export function ScoreCard({ score, history }: { score: ScoreResponse; history: ScoreHistoryEntry[] }) {
  const trend = history.map((h) => h.score).filter((s): s is number => s !== null);

  return (
    <div className="card">
      <div style={{ display: "flex", gap: 28, flexWrap: "wrap", alignItems: "center" }}>
        <ScoreGauge score={score.score} riskLevel={score.riskLevel} />

        <div style={{ flex: 1, minWidth: 200 }}>
          <div className="muted" style={{ fontFamily: "var(--mono)", fontSize: 13 }}>
            {score.mint}
          </div>
          <div style={{ marginTop: 10 }}>
            <RiskBadge riskLevel={score.riskLevel} />
          </div>
        </div>
      </div>

      {score.cluster ? (
        <div className="stat-row" style={{ marginTop: 24, marginBottom: 0 }}>
          <div className="stat-tile">
            <div className="stat-label">Launches</div>
            <div className="stat-value">{score.cluster.tokens_launched}</div>
          </div>
          <div className="stat-tile">
            <div className="stat-label">Rugs</div>
            <div className="stat-value" style={{ color: score.cluster.rug_count > 0 ? "var(--status-critical)" : undefined }}>
              {score.cluster.rug_count}
            </div>
          </div>
          <div className="stat-tile">
            <div className="stat-label">Moons</div>
            <div className="stat-value" style={{ color: score.cluster.moon_count > 0 ? "var(--status-good)" : undefined }}>
              {score.cluster.moon_count}
            </div>
          </div>
        </div>
      ) : score.cluster === null ? (
        <div style={{ marginTop: 20 }} className="muted">
          Upgrade for full deployer cluster history.
        </div>
      ) : null}

      {trend.length > 1 && (
        <div style={{ marginTop: 24 }}>
          <div className="stat-label" style={{ marginBottom: 10 }}>
            Score over time
          </div>
          <Sparkline values={trend} />
        </div>
      )}
    </div>
  );
}

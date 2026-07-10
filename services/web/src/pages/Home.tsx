import { useState } from "react";
import { getScore, getScoreHistory, type ScoreResponse, type ScoreHistoryEntry } from "../api.js";
import { ScoreCard } from "../components/ScoreCard.js";

export function Home() {
  const [mint, setMint] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [score, setScore] = useState<ScoreResponse | null>(null);
  const [history, setHistory] = useState<ScoreHistoryEntry[]>([]);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!mint.trim()) return;
    setLoading(true);
    setError(null);
    setScore(null);
    try {
      const [scoreRes, historyRes] = await Promise.all([getScore(mint.trim()), getScoreHistory(mint.trim())]);
      setScore(scoreRes);
      setHistory(historyRes.history);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch score");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div style={{ textAlign: "center", marginBottom: 40, maxWidth: 640, marginLeft: "auto", marginRight: "auto" }}>
        <div
          style={{
            display: "inline-block",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--brand-b)",
            background: "var(--brand-gradient-soft)",
            border: "1px solid var(--border)",
            borderRadius: 999,
            padding: "5px 14px",
            marginBottom: 18,
          }}
        >
          Real-time Solana rug detection
        </div>
        <h1
          style={{
            fontSize: 40,
            fontWeight: 800,
            letterSpacing: "-0.03em",
            margin: "0 0 12px",
            lineHeight: 1.1,
          }}
        >
          Know before you ape.
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: 15.5, margin: 0 }}>
          Paste any Solana contract address for an instant risk score, backed by deployer history traced across the
          entire funding graph — not just the wallet in front of you.
        </p>
      </div>

      <form onSubmit={search} className="search-row" style={{ maxWidth: 640, margin: "0 auto" }}>
        <input
          type="text"
          placeholder="Paste a token mint address..."
          value={mint}
          onChange={(e) => setMint(e.target.value)}
        />
        <button type="submit" disabled={loading}>
          {loading ? "Scoring..." : "Check"}
        </button>
      </form>

      {error && (
        <p className="error-text" style={{ marginTop: 16, textAlign: "center" }}>
          {error}
        </p>
      )}

      {score && (
        <div style={{ marginTop: 32 }}>
          <ScoreCard score={score} history={history} />
        </div>
      )}
    </div>
  );
}

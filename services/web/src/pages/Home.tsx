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
      <h1 style={{ fontSize: 20, marginBottom: 16 }}>Paste a contract address</h1>
      <form onSubmit={search} className="search-row">
        <input
          type="text"
          placeholder="Token mint address..."
          value={mint}
          onChange={(e) => setMint(e.target.value)}
        />
        <button type="submit" disabled={loading}>
          {loading ? "Scoring..." : "Check"}
        </button>
      </form>

      {error && (
        <p className="error-text" style={{ marginTop: 16 }}>
          {error}
        </p>
      )}

      {score && (
        <div style={{ marginTop: 24 }}>
          <ScoreCard score={score} history={history} />
        </div>
      )}
    </div>
  );
}

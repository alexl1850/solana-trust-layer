import { useEffect, useState } from "react";
import { getFeed, type FeedEvent } from "../api.js";
import { RiskBadge } from "../components/RiskBadge.js";

const POLL_INTERVAL_MS = 10_000; // matches the API's 10s minimum cache TTL

export function LiveFeed() {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await getFeed();
        if (!cancelled) setEvents(res.events);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load feed");
      }
    }

    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <div>
      <h1 className="page-title">Live feed</h1>
      <p className="page-subtitle">Every launch we score, streaming in as it happens.</p>
      {error && <p className="error-text">{error}</p>}
      <div className="card card-flush">
        <table>
          <thead>
            <tr>
              <th>Mint</th>
              <th>Score</th>
              <th>Risk</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e, i) => (
              <tr key={`${e.mint}-${i}`}>
                <td data-mono>{e.mint}</td>
                <td data-mono>{e.score !== null ? e.score.toFixed(0) : "—"}</td>
                <td>
                  <RiskBadge riskLevel={e.risk_level} />
                </td>
                <td className="muted">{new Date(e.created_at).toLocaleTimeString()}</td>
              </tr>
            ))}
            {events.length === 0 && (
              <tr>
                <td colSpan={4} className="muted" style={{ padding: 28, textAlign: "center" }}>
                  No launches scored yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

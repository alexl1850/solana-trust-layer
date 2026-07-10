import { useEffect, useState } from "react";
import { getReceipts, type Receipt } from "../api.js";

export function Receipts() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getReceipts()
      .then((res) => setReceipts(res.receipts))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load receipts"));
  }, []);

  return (
    <div>
      <h1 className="page-title">Receipts</h1>
      <p className="page-subtitle">
        Every score is written to an append-only log. Once an hour we hash that log into a Merkle root and anchor it
        on Solana — proof that no score shown here was backdated.
      </p>
      {error && <p className="error-text">{error}</p>}
      <div className="card card-flush">
        <table>
          <thead>
            <tr>
              <th>Period</th>
              <th>Events</th>
              <th>Merkle root</th>
              <th>On-chain proof</th>
            </tr>
          </thead>
          <tbody>
            {receipts.map((r) => (
              <tr key={r.id}>
                <td className="muted">{new Date(r.period_start).toLocaleString()}</td>
                <td data-mono>{r.event_count}</td>
                <td data-mono style={{ fontSize: 12 }}>
                  {r.merkle_root.slice(0, 16)}…
                </td>
                <td>
                  {r.solana_tx_signature ? (
                    <a
                      href={`https://solscan.io/tx/${r.solana_tx_signature}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "var(--brand-b)" }}
                    >
                      view →
                    </a>
                  ) : (
                    <span className="muted">pending</span>
                  )}
                </td>
              </tr>
            ))}
            {receipts.length === 0 && (
              <tr>
                <td colSpan={4} className="muted" style={{ padding: 28, textAlign: "center" }}>
                  No receipts anchored yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

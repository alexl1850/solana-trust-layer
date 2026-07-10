const ENDPOINTS = [
  { method: "GET", path: "/v1/score/:mint", desc: "Current score + risk level for a token." },
  { method: "GET", path: "/v1/score/:mint/history", desc: "Score-over-time for a token." },
  { method: "GET", path: "/v1/feed", desc: "Most recent launch scores across all tokens." },
  { method: "GET", path: "/v1/cluster/:deployerWallet", desc: "Cluster reputation for a deployer wallet." },
  { method: "GET", path: "/v1/receipts", desc: "Public receipts feed (Merkle-anchored score batches)." },
  { method: "GET", path: "/v1/receipts/:merkleRoot", desc: "Look up a specific receipt by its Merkle root." },
  { method: "POST", path: "/v1/auth/nonce", desc: "Request a sign-in nonce for a wallet address." },
  { method: "POST", path: "/v1/auth/verify", desc: "Verify a signed nonce, receive a JWT + tier." },
  { method: "GET", path: "/v1/account", desc: "Current tier status and usage (requires auth)." },
];

export function Docs() {
  return (
    <div>
      <h1 style={{ fontSize: 20, marginBottom: 8 }}>API docs</h1>
      <p className="muted" style={{ marginBottom: 16 }}>
        Authenticate with a wallet signature (see Account) to get a JWT, then pass it as{" "}
        <code>Authorization: Bearer &lt;token&gt;</code>. Free tier: 3 score lookups/day, no cluster detail. Hold
        1,000,000+ of the trust token for full access, free.
      </p>
      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Method</th>
              <th>Path</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            {ENDPOINTS.map((e) => (
              <tr key={e.path + e.method}>
                <td>{e.method}</td>
                <td>{e.path}</td>
                <td className="muted">{e.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

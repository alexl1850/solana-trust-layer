const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export interface ScoreResponse {
  mint: string;
  score: number | null;
  riskLevel: "unknown" | "low" | "medium" | "high" | "critical";
  scoredAt: string;
  cluster?: {
    id: string;
    rug_count: number;
    moon_count: number;
    tokens_launched: number;
    reputation_score: number | null;
  } | null;
}

export interface ScoreHistoryEntry {
  score: number | null;
  risk_level: string;
  trigger: string;
  created_at: string;
}

export interface Receipt {
  id: string;
  period_start: string;
  period_end: string;
  merkle_root: string;
  event_count: number;
  solana_tx_signature: string | null;
  anchored_at: string | null;
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("stl_jwt");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export function requestNonce(wallet: string): Promise<{ message: string; expiresAt: string }> {
  return post("/v1/auth/nonce", { wallet });
}

export function verifySignature(wallet: string, signature: string): Promise<{ token: string; tier: string }> {
  return post("/v1/auth/verify", { wallet, signature });
}

export function getScore(mint: string): Promise<ScoreResponse> {
  return get(`/v1/score/${mint}`);
}

export function getScoreHistory(mint: string): Promise<{ mint: string; history: ScoreHistoryEntry[] }> {
  return get(`/v1/score/${mint}/history`);
}

export function getReceipts(): Promise<{ receipts: Receipt[] }> {
  return get(`/v1/receipts`);
}

export interface FeedEvent {
  mint: string;
  score: number | null;
  risk_level: string;
  trigger: string;
  created_at: string;
}

export function getFeed(): Promise<{ events: FeedEvent[] }> {
  return get(`/v1/feed`);
}

export function getAccount(): Promise<{
  wallet_address: string;
  tier: string;
  token_balance: number;
  balance_checked_at: string | null;
}> {
  return get(`/v1/account`);
}

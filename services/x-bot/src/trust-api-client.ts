export interface TrustScore {
  mint: string;
  score: number | null;
  riskLevel: string;
  cluster?: {
    tokens_launched: number;
    rug_count: number;
    moon_count: number;
  } | null;
}

export interface FeedEvent {
  mint: string;
  score: number | null;
  risk_level: string;
  trigger: string;
  created_at: string;
}

/** Thin client for our own public API — the bot is just another API consumer, same as the web app. */
export class TrustApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  async getScore(mint: string): Promise<TrustScore | null> {
    const res = await fetch(`${this.baseUrl}/v1/score/${mint}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`getScore ${res.status}: ${await res.text()}`);
    return res.json() as Promise<TrustScore>;
  }

  async getFeed(limit = 100): Promise<FeedEvent[]> {
    const res = await fetch(`${this.baseUrl}/v1/feed?limit=${limit}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) throw new Error(`getFeed ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as { events: FeedEvent[] };
    return body.events;
  }
}

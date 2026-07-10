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
}

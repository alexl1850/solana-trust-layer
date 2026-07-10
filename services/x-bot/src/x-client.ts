import { buildOAuth1Header, type OAuth1Credentials } from "./oauth1.js";

export interface Mention {
  id: string;
  text: string;
  authorId: string | undefined;
}

export interface XClientOptions extends OAuth1Credentials {
  bearerToken: string;
}

/** Thin wrapper around the X API v2 surface the bot needs: reading mentions, posting replies. */
export class XClient {
  constructor(private readonly opts: XClientOptions) {}

  async getMentions(userId: string, sinceId?: string): Promise<Mention[]> {
    const url = new URL(`https://api.twitter.com/2/users/${userId}/mentions`);
    url.searchParams.set("tweet.fields", "author_id");
    if (sinceId) url.searchParams.set("since_id", sinceId);

    const res = await fetch(url, { headers: { Authorization: `Bearer ${this.opts.bearerToken}` } });
    if (!res.ok) throw new Error(`X API getMentions ${res.status}: ${await res.text()}`);

    const body = (await res.json()) as { data?: Array<{ id: string; text: string; author_id?: string }> };
    return (body.data ?? []).map((t) => ({ id: t.id, text: t.text, authorId: t.author_id }));
  }

  async postReply(text: string, inReplyToTweetId: string): Promise<string> {
    return this.postTweet(text, inReplyToTweetId);
  }

  async postTweet(text: string, inReplyToTweetId?: string): Promise<string> {
    const url = "https://api.twitter.com/2/tweets";
    const body: Record<string, unknown> = { text };
    if (inReplyToTweetId) body.reply = { in_reply_to_tweet_id: inReplyToTweetId };

    // OAuth 1.0a signs only form/query params, not a JSON body — pass {} here.
    const authHeader = buildOAuth1Header("POST", url, {}, this.opts);

    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`X API postTweet ${res.status}: ${await res.text()}`);

    const result = (await res.json()) as { data: { id: string } };
    return result.data.id;
  }
}

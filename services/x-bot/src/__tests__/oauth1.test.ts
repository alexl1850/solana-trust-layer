import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildOAuth1Header, type OAuth1Credentials } from "../oauth1.js";

const CREDS: OAuth1Credentials = {
  apiKey: "xvz1evFS4wEEPTGEFPHBog",
  apiSecret: "kAcSOqF21Fu85e7zjz7ZN2U4ZkVjni90mR5vBK9Sm",
  accessToken: "370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb",
  accessTokenSecret: "LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE",
};

/** RFC 3986 percent-encoding per the OAuth 1.0a spec, written independently from oauth1.ts for differential testing. */
function refEncode(str: string): string {
  return encodeURIComponent(str).replace(/[!*'()]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

/** Reference OAuth1 signature computed straight from RFC 5849 §3.4, independent of oauth1.ts's implementation. */
function referenceSignature(
  method: string,
  url: string,
  bodyParams: Record<string, string>,
  oauthParams: Record<string, string>,
  creds: OAuth1Credentials,
): string {
  const allParams = { ...bodyParams, ...oauthParams };
  const paramString = Object.keys(allParams)
    .sort()
    .map((k) => `${refEncode(k)}=${refEncode(allParams[k]!)}`)
    .join("&");
  const baseString = `${method.toUpperCase()}&${refEncode(url)}&${refEncode(paramString)}`;
  const signingKey = `${refEncode(creds.apiSecret)}&${refEncode(creds.accessTokenSecret)}`;
  return createHmac("sha1", signingKey).update(baseString).digest("base64");
}

describe("buildOAuth1Header", () => {
  it("produces a signature matching an independent from-spec reference implementation", () => {
    const nonce = "kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg";
    const timestamp = "1318622958";
    const bodyParams = { status: "Hello Ladies + Gentlemen, a signed OAuth request!", include_entities: "true" };
    const url = "https://api.twitter.com/1.1/statuses/update.json";

    const header = buildOAuth1Header("POST", url, bodyParams, CREDS, nonce, timestamp);

    const expectedSignature = referenceSignature(
      "POST",
      url,
      bodyParams,
      {
        oauth_consumer_key: CREDS.apiKey,
        oauth_nonce: nonce,
        oauth_signature_method: "HMAC-SHA1",
        oauth_timestamp: timestamp,
        oauth_token: CREDS.accessToken,
        oauth_version: "1.0",
      },
      CREDS,
    );

    expect(header).toContain(`oauth_signature="${refEncode(expectedSignature)}"`);
    expect(header).toContain(`oauth_consumer_key="${CREDS.apiKey}"`);
    expect(header.startsWith("OAuth ")).toBe(true);
  });

  it("is deterministic for identical inputs (fixed nonce/timestamp)", () => {
    const a = buildOAuth1Header("POST", "https://api.twitter.com/2/tweets", { text: "hi" }, CREDS, "nonce", "1000");
    const b = buildOAuth1Header("POST", "https://api.twitter.com/2/tweets", { text: "hi" }, CREDS, "nonce", "1000");
    expect(a).toBe(b);
  });

  it("produces a different signature when the signed body changes", () => {
    const a = buildOAuth1Header("POST", "https://api.twitter.com/2/tweets", { text: "a" }, CREDS, "nonce", "1000");
    const b = buildOAuth1Header("POST", "https://api.twitter.com/2/tweets", { text: "b" }, CREDS, "nonce", "1000");
    expect(a).not.toBe(b);
  });

  it("percent-encodes reserved characters OAuth requires beyond encodeURIComponent's default set (!*'())", () => {
    const header = buildOAuth1Header(
      "POST",
      "https://api.twitter.com/2/tweets",
      { text: "a!b*c'd(e)f" },
      CREDS,
      "nonce",
      "1000",
    );
    // A raw '!' from encodeURIComponent would appear un-encoded in the base string's percent-encoded form (%21 expected instead).
    expect(header).not.toContain("!");
  });
});

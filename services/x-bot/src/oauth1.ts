import { createHmac, randomBytes } from "node:crypto";

export interface OAuth1Credentials {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessTokenSecret: string;
}

function percentEncode(str: string): string {
  return encodeURIComponent(str).replace(/[!*'()]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

/**
 * Builds an OAuth 1.0a `Authorization` header for the X API v2 (posting
 * tweets/replies requires OAuth 1.0a user-context auth, not just a bearer
 * token — reads like /v1/feed etc. use the app-only bearer token instead).
 */
export function buildOAuth1Header(
  method: string,
  url: string,
  bodyParams: Record<string, string>,
  creds: OAuth1Credentials,
  nonceOverride?: string,
  timestampOverride?: string,
): string {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: creds.apiKey,
    oauth_nonce: nonceOverride ?? randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: timestampOverride ?? Math.floor(Date.now() / 1000).toString(),
    oauth_token: creds.accessToken,
    oauth_version: "1.0",
  };

  const allParams = { ...bodyParams, ...oauthParams };
  const paramString = Object.keys(allParams)
    .sort()
    .map((k) => `${percentEncode(k)}=${percentEncode(allParams[k]!)}`)
    .join("&");

  const baseString = `${method.toUpperCase()}&${percentEncode(url)}&${percentEncode(paramString)}`;
  const signingKey = `${percentEncode(creds.apiSecret)}&${percentEncode(creds.accessTokenSecret)}`;
  const signature = createHmac("sha1", signingKey).update(baseString).digest("base64");

  const headerParams: Record<string, string> = { ...oauthParams, oauth_signature: signature };
  return (
    "OAuth " +
    Object.keys(headerParams)
      .sort()
      .map((k) => `${percentEncode(k)}="${percentEncode(headerParams[k]!)}"`)
      .join(", ")
  );
}

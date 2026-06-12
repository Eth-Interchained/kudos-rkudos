import { createHmac, randomBytes } from "node:crypto";
import type { Logger } from "pino";

/**
 * X (Twitter) WRITE adapter — posts the AiAS-authored block content to X.
 *
 * Posting a tweet (POST /2/tweets) requires USER-context auth. We use OAuth
 * 1.0a, signed from the four "classic" X Developer Portal credentials:
 *   - X_API_KEY            (API Key / Consumer Key)
 *   - X_API_SECRET         (API Key Secret / Consumer Secret)
 *   - X_ACCESS_TOKEN       (Access Token)
 *   - X_ACCESS_TOKEN_SECRET(Access Token Secret)
 * The app-only Bearer token CANNOT post, so it is intentionally not used here.
 *
 * Real data only: posts for real when the four creds are present, otherwise it
 * throws the raw error. There is NO simulated fallback.
 *
 * The posting account handle (for building the resulting URL + share intents)
 * is configurable via X_ACCOUNT_HANDLE, defaulting to the project handle.
 */

const TWEETS_ENDPOINT = "https://api.twitter.com/2/tweets";

export const X_ACCOUNT_HANDLE = process.env.X_ACCOUNT_HANDLE ?? "interchained";

function oauthCreds() {
  return {
    consumerKey: process.env.X_API_KEY ?? "",
    consumerSecret: process.env.X_API_SECRET ?? "",
    token: process.env.X_ACCESS_TOKEN ?? "",
    tokenSecret: process.env.X_ACCESS_TOKEN_SECRET ?? "",
  };
}

export function xPostMode(): "api" | "unconfigured" {
  const c = oauthCreds();
  return c.consumerKey && c.consumerSecret && c.token && c.tokenSecret
    ? "api"
    : "unconfigured";
}

export interface PostedTweet {
  id: string;
  url: string;
  mode: "api";
}

/** RFC 3986 percent-encoding, as required by the OAuth 1.0a spec. */
function pct(value: string): string {
  return encodeURIComponent(value).replace(
    /[!*'()]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}

/**
 * Build an OAuth 1.0a Authorization header for a request. The JSON body is not
 * part of the signature base string for application/json requests — only the
 * oauth_* parameters (and any query params) are signed.
 */
function oauthHeader(method: string, url: string): string {
  const { consumerKey, consumerSecret, token, tokenSecret } = oauthCreds();
  const params: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: token,
    oauth_version: "1.0",
  };
  const paramString = Object.keys(params)
    .sort()
    .map((k) => `${pct(k)}=${pct(params[k])}`)
    .join("&");
  const base = `${method.toUpperCase()}&${pct(url)}&${pct(paramString)}`;
  const signingKey = `${pct(consumerSecret)}&${pct(tokenSecret)}`;
  const signature = createHmac("sha1", signingKey).update(base).digest("base64");

  const headerParams: Record<string, string> = {
    ...params,
    oauth_signature: signature,
  };
  return (
    "OAuth " +
    Object.keys(headerParams)
      .sort()
      .map((k) => `${pct(k)}="${pct(headerParams[k])}"`)
      .join(", ")
  );
}

/** Post a tweet via the X API. Throws the raw error when not configured or on failure. */
export async function postTweet(
  text: string,
  log?: Logger,
): Promise<PostedTweet> {
  if (xPostMode() !== "api") {
    throw new Error("X write credentials not configured");
  }
  const res = await fetch(TWEETS_ENDPOINT, {
    method: "POST",
    headers: {
      authorization: oauthHeader("POST", TWEETS_ENDPOINT),
      "content-type": "application/json",
    },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const body = await res.text();
    log?.warn({ status: res.status, body }, "X postTweet failed");
    throw new Error(`X postTweet failed: ${res.status}`);
  }
  const json = (await res.json()) as { data?: { id?: string } };
  const id = json.data?.id;
  if (!id) throw new Error("X postTweet returned no id");
  return {
    id,
    url: `https://x.com/${X_ACCOUNT_HANDLE}/status/${id}`,
    mode: "api",
  };
}

/**
 * Build an X "intent" (web share) URL so an admin can post the AiAS content
 * with one click during semi-automated operation.
 */
export function buildShareUrl(text: string): string {
  return `https://x.com/intent/tweet?text=${encodeURIComponent(text)}`;
}

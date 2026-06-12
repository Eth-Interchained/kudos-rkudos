import type { Logger } from "pino";
import { secret } from "../config";

/**
 * NetRows adapter — X.com (Twitter) data source.
 * NetRows is used in place of the official X API because it is significantly
 * cheaper per call. To conserve credits, NetRows is only hit on operator/admin
 * actions and the automated sync cadence — never on public/portal page reads.
 *
 * Verified against the NetRows X.com Developer Reference. Three GET endpoints,
 * Bearer auth, base https://api.netrows.com/v1. Response conventions:
 *   - /x/users/info   -> json.status == "success", data in json.data
 *   - /x/users/tweets -> json.status == "success", tweets in json.data.tweets
 *   - /x/tweets/replies -> HTTP 200, tweets in json.tweets (no data wrapper)
 */

const BASE_URL = "https://api.netrows.com/v1";
const TIMEOUT_MS = 30_000;

/** X.com redirect paths that are not real author handles. */
const BROKEN_USERNAMES = new Set(["i", "intent", "share"]);

export function netrowsMode(): "netrows" | "unconfigured" {
  return secret("NETROWS_API_KEY") ? "netrows" : "unconfigured";
}

function authHeaders(): Record<string, string> {
  const key = secret("NETROWS_API_KEY") ?? "";
  return {
    Authorization: `Bearer ${key}`,
    "X-API-Key": key,
    "Content-Type": "application/json",
  };
}

async function getJson(
  path: string,
  log?: Logger,
): Promise<{ status: number; json: unknown } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: authHeaders(),
      signal: controller.signal,
    });
    const json = (await res.json().catch(() => null)) as unknown;
    return { status: res.status, json };
  } catch (err) {
    log?.warn({ err, path }, "NetRows request error");
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Upgrade a `_normal` avatar URL to higher resolution. */
function upgradeAvatar(url: string): string {
  return url.includes("_normal") ? url.replace("_normal", "_400x400") : url;
}

// ---- URL parsing (no API cost) -------------------------------------------

/** Extract the numeric tweet id from an X/Twitter status URL. */
export function extractTweetId(url: string): string | null {
  const patterns = [
    /(?:twitter|x)\.com\/\w+\/status\/(\d+)/i,
    /status\/(\d+)/i,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

/** Extract the author handle, rejecting i/intent/share redirect paths. */
export function extractUsername(url: string): string | null {
  const m = url.match(/(?:twitter|x)\.com\/(\w+)\/status\//i);
  if (!m) return null;
  const username = m[1];
  if (BROKEN_USERNAMES.has(username.toLowerCase())) return null;
  return username;
}

// ---- Typed payloads -------------------------------------------------------

export interface NetrowsUser {
  id: string;
  userName: string;
  name: string;
  avatar: string;
  followers: number;
  following: number;
}

export interface NetrowsReply {
  id: string;
  text: string;
  authorUsername: string;
  authorName: string;
  authorAvatar: string;
  createdAt: string;
  likes: number;
  retweets: number;
}

// ---- Endpoint 1: author profile (optional / non-fatal) -------------------

export async function fetchUserInfo(
  username: string,
  log?: Logger,
): Promise<NetrowsUser | null> {
  if (netrowsMode() !== "netrows") return null;
  if (BROKEN_USERNAMES.has(username.toLowerCase())) return null;
  const res = await getJson(
    `/x/users/info?username=${encodeURIComponent(username)}`,
    log,
  );
  if (!res || res.status !== 200) return null;
  const body = res.json as { status?: string; data?: Record<string, unknown> };
  if (body?.status !== "success" || !body.data) return null;
  const d = body.data;
  const avatarRaw =
    (d.profilePicture as string) ||
    (d.profileImageUrl as string) ||
    (d.profile_image_url_https as string) ||
    "";
  return {
    id: String(d.id ?? d.userId ?? d.restId ?? ""),
    userName: (d.userName as string) ?? username,
    name: (d.name as string) ?? username,
    avatar: avatarRaw ? upgradeAvatar(avatarRaw) : "",
    followers: Number(d.followers ?? 0) || 0,
    following: Number(d.following ?? 0) || 0,
  };
}

// ---- Endpoints 2+3: locate tweet, then fetch replies ---------------------

interface NetrowsTweet {
  id: string;
  conversationId?: string;
  text?: string;
}

async function fetchUserTweets(
  username: string,
  log?: Logger,
): Promise<NetrowsTweet[] | null> {
  const res = await getJson(
    `/x/users/tweets?username=${encodeURIComponent(username)}`,
    log,
  );
  if (!res || res.status !== 200) {
    log?.warn({ status: res?.status }, "NetRows tweets endpoint failed");
    return null;
  }
  const body = res.json as {
    status?: string;
    msg?: string;
    data?: { tweets?: NetrowsTweet[] };
  };
  if (body?.status !== "success") {
    log?.warn({ msg: body?.msg }, "NetRows tweets endpoint returned error");
    return null;
  }
  return body.data?.tweets ?? [];
}

async function fetchTweetReplies(
  tweetId: string,
  log?: Logger,
): Promise<NetrowsReply[] | null> {
  const res = await getJson(
    `/x/tweets/replies?id=${encodeURIComponent(tweetId)}`,
    log,
  );
  // null = the replies request itself failed (no key / network / non-200).
  // That is different from an empty array, which means the post genuinely has
  // no replies yet. Callers use this distinction to decide skip vs. "0 synced".
  if (!res || res.status !== 200) {
    log?.warn({ tweetId, status: res?.status }, "NetRows replies endpoint failed");
    return null;
  }
  const body = res.json as { tweets?: Array<Record<string, unknown>> };
  const raw = Array.isArray(body?.tweets) ? body.tweets : [];
  // The replies endpoint returns the whole conversation, which includes the
  // ROOT tweet (the original block post itself). Drop it — it is not a reply.
  const repliesOnly = raw.filter((r) => String(r.id ?? "") !== String(tweetId));
  // NetRows returns replies newest-first. Keep up to 100 (so busy posts don't
  // drop replies) then reverse to oldest-first (chronological chain order).
  const trimmed = repliesOnly.slice(0, 100).reverse();
  return trimmed.map((r) => {
    const author = (r.author as Record<string, unknown>) ?? {};
    const avatarRaw =
      (author.profilePicture as string) || (author.avatar as string) || "";
    const handle =
      (author.userName as string) || (r.author_username as string) || "user";
    return {
      id: String(r.id ?? ""),
      text: (r.text as string) ?? "",
      authorUsername: handle,
      authorName: (author.name as string) || (r.author_name as string) || handle,
      authorAvatar: avatarRaw ? upgradeAvatar(avatarRaw) : "",
      createdAt: (r.createdAt as string) ?? "",
      likes: Number(r.likeCount ?? 0) || 0,
      retweets: Number(r.retweetCount ?? 0) || 0,
    };
  });
}

export interface NetrowsThread {
  author: NetrowsUser | null;
  replies: NetrowsReply[];
  tweetFound: boolean;
}

/**
 * Pull a thread (author profile + replies) for a tweet. Replies are fetched
 * directly by tweet id, so this works for older block posts too — even after
 * they scroll out of the author's recent-tweets list. The username is optional
 * (used only for best-effort author detail). Returns null only when the replies
 * endpoint cannot be reached at all (no key, network, or non-200).
 */
export async function syncThread(
  tweetId: string,
  username: string | null,
  log?: Logger,
): Promise<NetrowsThread | null> {
  if (netrowsMode() !== "netrows") {
    log?.info("NetRows API key not configured; skipping live sync");
    return null;
  }

  // Author lookup needs a real handle and is best-effort; a missing or
  // redirect-path (i/intent/share) handle does NOT block reply fetching.
  const author =
    username && !BROKEN_USERNAMES.has(username.toLowerCase())
      ? await fetchUserInfo(username, log)
      : null;

  // Fetch replies by tweet id directly. We intentionally do NOT gate this on
  // the post still appearing in the author's recent tweets — an active account
  // pushes older block posts off that list, which would otherwise silently
  // block all reply syncing for those blocks.
  const replies = await fetchTweetReplies(tweetId, log);
  if (replies === null) {
    log?.warn(
      { tweetId, username },
      "NetRows: replies endpoint unreachable — cannot sync thread",
    );
    return null;
  }

  return { author, replies, tweetFound: true };
}

// ---- Recent posts for a project (featured-projects sync) ------------------

export interface NetrowsPost {
  id: string;
  url: string;
  text: string;
}

/**
 * Pull a user's most recent posts (default 20) for the Featured Projects sync.
 * Returns null when NetRows is not configured (simulated mode) or the handle is
 * unusable, so callers can degrade gracefully (approval still succeeds with no
 * posts synced).
 */
export async function fetchRecentUserPosts(
  username: string,
  limit = 20,
  log?: Logger,
): Promise<NetrowsPost[] | null> {
  if (netrowsMode() !== "netrows") {
    log?.info("NetRows API key not configured; skipping recent-posts sync");
    return null;
  }
  const handle = username.replace(/^@/, "");
  if (BROKEN_USERNAMES.has(handle.toLowerCase())) return null;
  const tweets = await fetchUserTweets(handle, log);
  if (tweets === null) return null;
  return tweets.slice(0, limit).map((t) => ({
    id: String(t.id),
    url: `https://x.com/${handle}/status/${t.id}`,
    text: t.text ?? "",
  }));
}

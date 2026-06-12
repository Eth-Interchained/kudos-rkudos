import { createHash } from "node:crypto";
import type { Logger } from "pino";
import {
  fetchUserInfo,
  netrowsMode,
  syncThread,
  type NetrowsReply,
} from "./netrows";

/**
 * X (Twitter) read adapter.
 * Live mode: NetRows (see ./netrows). NetRows is cheaper than the official X
 *   API, so it is the data source for profile + reply reads. Profiles from
 *   NetRows expose followers but NOT verification status or account age, so we
 *   default those to "untrusted" rather than fabricating trust signals.
 * Simulation mode: deterministic pseudo-profiles derived from the handle, used
 *   only when NETROWS_API_KEY is absent or a live lookup fails.
 */

export function xMode(): "netrows" | "simulated" {
  return netrowsMode() === "netrows" ? "netrows" : "simulated";
}

export interface XUser {
  xUserId: string;
  handle: string;
  followersCount: number;
  verified: boolean;
  accountCreated: string | null;
}

function hashInt(seed: string, mod: number): number {
  const h = createHash("sha256").update(seed).digest();
  return h.readUInt32BE(0) % mod;
}

function simulateUser(clean: string): XUser {
  const followers = [12, 87, 340, 1200, 5400, 23000, 120000][
    hashInt(`f:${clean}`, 7)
  ];
  const verified = hashInt(`v:${clean}`, 5) === 0;
  const ageDays = 90 + hashInt(`a:${clean}`, 2200);
  const created = new Date(Date.now() - ageDays * 86400000).toISOString();
  return {
    xUserId: `sim_${createHash("sha256").update(clean).digest("hex").slice(0, 16)}`,
    handle: clean,
    followersCount: followers,
    verified,
    accountCreated: created,
  };
}

/** Resolve a handle to a profile via NetRows (followers only), else simulate. */
export async function lookupUser(handle: string, log?: Logger): Promise<XUser> {
  const clean = handle.replace(/^@/, "");
  if (netrowsMode() === "netrows") {
    const info = await fetchUserInfo(clean, log);
    if (info) {
      return {
        xUserId: info.id || `nr_${createHash("sha256").update(clean).digest("hex").slice(0, 16)}`,
        handle: info.userName || clean,
        followersCount: info.followers,
        // NetRows /x/users/info does not expose verification or creation date —
        // do not fabricate trust signals from a live profile.
        verified: false,
        accountCreated: null,
      };
    }
    log?.warn({ handle: clean }, "NetRows lookupUser miss; using simulation");
  }
  return simulateUser(clean);
}

export interface XReply {
  xReplyId: string;
  authorHandle: string;
  text: string;
}

/**
 * Fetch replies for a tweet via NetRows, keyed by tweet id. The author handle
 * is optional (used only for best-effort author detail). Returns [] when the
 * thread cannot be synced.
 */
export async function fetchReplies(
  tweetId: string,
  username: string | null,
  log?: Logger,
): Promise<XReply[]> {
  const thread = await syncThread(tweetId, username, log);
  if (!thread) return [];
  return thread.replies.map(toXReply);
}

export function toXReply(r: NetrowsReply): XReply {
  return {
    xReplyId: r.id,
    authorHandle: r.authorUsername,
    text: r.text,
  };
}

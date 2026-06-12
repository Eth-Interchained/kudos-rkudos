#!/usr/bin/env python3
"""Import X (Twitter) posts for a handle via the NetRows API.

Saved output is *reference material*: a normalized JSON file the Social Mining
API server can later turn into historical "past blocks" (see the admin
"Import posts" action). NetRows is used instead of the official X API because it
is far cheaper per call.

Usage:
    python scripts/import_x_posts.py                      # defaults to @interchained
    python scripts/import_x_posts.py --username someone   # any public handle
    python scripts/import_x_posts.py --out path/to.json   # custom output path
    python scripts/import_x_posts.py --limit 50           # cap saved posts

Requires the NETROWS_API_KEY environment variable. Without it the script exits
with a clear message (it never invents data).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

BASE_URL = "https://api.netrows.com/v1"
TIMEOUT_S = 30

# Default output: the API server reads this path (relative to its own cwd,
# artifacts/api-server) when importing posts as historical blocks.
DEFAULT_OUT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "artifacts",
    "api-server",
    "data",
    "x_posts_reference.json",
)

# X redirect paths that are not real author handles.
BROKEN_USERNAMES = {"i", "intent", "share"}


def _get_json(path: str, api_key: str) -> dict:
    url = f"{BASE_URL}{path}"
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {api_key}",
            "X-API-Key": api_key,
            "Content-Type": "application/json",
            "Accept": "application/json",
            # NetRows' edge blocks the default Python-urllib UA with a 403.
            "User-Agent": "social-mining-importer/1.0",
        },
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
        raw = resp.read().decode("utf-8")
    return json.loads(raw)


def _first(d: dict, *keys, default=None):
    for k in keys:
        if k in d and d[k] is not None:
            return d[k]
    return default


def normalize_tweet(raw: dict, username: str) -> dict | None:
    tweet_id = _first(raw, "id", "tweetId", "id_str", "rest_id")
    if not tweet_id:
        return None
    tweet_id = str(tweet_id)
    text = _first(raw, "text", "full_text", "fullText", default="") or ""
    return {
        "id": tweet_id,
        "url": f"https://x.com/{username}/status/{tweet_id}",
        "text": text,
        "createdAt": _first(raw, "createdAt", "created_at", "date", default=""),
        "conversationId": str(_first(raw, "conversationId", "conversation_id", default="")),
        "likes": int(_first(raw, "likeCount", "favorite_count", "likes", default=0) or 0),
        "retweets": int(_first(raw, "retweetCount", "retweet_count", "retweets", default=0) or 0),
        "replies": int(_first(raw, "replyCount", "reply_count", default=0) or 0),
    }


def fetch_tweets(username: str, api_key: str) -> list[dict]:
    path = "/x/users/tweets?username=" + urllib.parse.quote(username)
    body = _get_json(path, api_key)
    if not isinstance(body, dict) or body.get("status") != "success":
        msg = body.get("msg") if isinstance(body, dict) else "unexpected response"
        raise RuntimeError(f"NetRows tweets endpoint returned an error: {msg}")
    data = body.get("data") or {}
    tweets = data.get("tweets")
    if not isinstance(tweets, list):
        raise RuntimeError("NetRows response did not include data.tweets")
    return tweets


def main() -> int:
    parser = argparse.ArgumentParser(description="Import X posts via NetRows.")
    parser.add_argument("--username", default="interchained", help="X handle (no @).")
    parser.add_argument("--out", default=DEFAULT_OUT, help="Output JSON path.")
    parser.add_argument("--limit", type=int, default=0, help="Max posts to save (0 = all).")
    args = parser.parse_args()

    username = args.username.lstrip("@").strip()
    if not username or username.lower() in BROKEN_USERNAMES:
        print(f"error: '{args.username}' is not a valid X handle", file=sys.stderr)
        return 2

    api_key = os.environ.get("NETROWS_API_KEY", "").strip()
    if not api_key:
        print(
            "error: NETROWS_API_KEY is not set.\n"
            "Add it as a secret, then re-run this script to import real posts.",
            file=sys.stderr,
        )
        return 1

    print(f"Fetching tweets for @{username} via NetRows ...")
    try:
        raw_tweets = fetch_tweets(username, api_key)
    except urllib.error.HTTPError as err:
        print(f"error: NetRows HTTP {err.code} {err.reason}", file=sys.stderr)
        return 1
    except (urllib.error.URLError, RuntimeError, json.JSONDecodeError) as err:
        print(f"error: {err}", file=sys.stderr)
        return 1

    posts = []
    for raw in raw_tweets:
        if not isinstance(raw, dict):
            continue
        norm = normalize_tweet(raw, username)
        if norm:
            posts.append(norm)
    if args.limit and args.limit > 0:
        posts = posts[: args.limit]

    out_doc = {
        "handle": username,
        "source": "netrows",
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "count": len(posts),
        "posts": posts,
    }

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(out_doc, fh, indent=2, ensure_ascii=False)

    print(f"Saved {len(posts)} posts to {args.out}")
    print("Next: open the admin console and click 'Import posts' to add them as past blocks.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

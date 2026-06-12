import type { Logger } from "pino";
import type { Block } from "@workspace/db";
import {
  extractTweetId,
  extractUsername,
  netrowsMode,
  syncThread,
} from "./integrations/netrows";
import {
  ingestAndScoreReply,
  DuplicateReplyError,
  ScoringUnavailableError,
} from "./replyPipeline";
import { recordAudit } from "./audit";

export interface SyncResult {
  mode: "netrows" | "skipped";
  author: string | null;
  fetched: number;
  created: number;
  valid: number;
  rejected: number;
  duplicates: number;
  message: string;
}

/**
 * Pull replies for a block from NetRows and run them through the scoring
 * pipeline. Real data only — when NetRows is not configured or the live thread
 * cannot be synced, it reports a skip with the raw reason and ingests nothing.
 * Already-scored comment ids are never re-scored (skipped silently).
 */
export async function syncBlockReplies(
  block: Block,
  actor: string,
  log?: Logger,
): Promise<SyncResult> {
  const url = block.xPostUrl ?? "";
  const tweetId = block.xPostId && !block.xPostId.startsWith("sim_")
    ? block.xPostId
    : extractTweetId(url);
  // Username is best-effort (used for author display only). Replies are fetched
  // by tweet id alone, so a missing/redirect handle no longer blocks the sync.
  const username = extractUsername(url);

  if (netrowsMode() === "netrows" && tweetId) {
    const thread = await syncThread(tweetId, username, log);
    if (thread) {
      let created = 0;
      let valid = 0;
      let rejected = 0;
      let duplicates = 0;
      let scoreUnavailable = 0;
      for (const r of thread.replies) {
        try {
          const result = await ingestAndScoreReply(
            block,
            { handle: r.authorUsername, replyText: r.text, xReplyId: r.id },
            log,
          );
          // null = already-scored comment id (immutable) → skip silently.
          if (!result) continue;
          created += 1;
          if (result.reply.status === "valid") valid += 1;
          else rejected += 1;
        } catch (err) {
          if (err instanceof DuplicateReplyError) duplicates += 1;
          else if (err instanceof ScoringUnavailableError) scoreUnavailable += 1;
          else log?.warn({ err }, "NetRows sync: reply ingest failed");
        }
      }
      if (scoreUnavailable > 0) {
        log?.error(
          { seq: block.seq, scoreUnavailable, created },
          "NetRows sync: AiAS scoring unavailable for some replies — those were NOT credited",
        );
      }
      const dropNote =
        scoreUnavailable > 0
          ? ` ${scoreUnavailable} reply(ies) NOT credited: AiAS scoring unavailable — check AIAS_API_KEY / AIAS_PROVIDER / AIAS_MODEL.`
          : "";
      const result: SyncResult = {
        mode: "netrows",
        author: thread.author?.userName ?? username,
        fetched: thread.replies.length,
        created,
        valid,
        rejected,
        duplicates,
        message: `Synced ${created} new reply(ies)${username ? ` from @${username}` : ""} via NetRows.${dropNote}`,
      };
      await recordAudit({
        actor,
        action: "block.sync_netrows",
        entity: "block",
        entityId: block.id,
        detail: JSON.stringify(result),
      });
      return result;
    }
  }

  const reason =
    netrowsMode() !== "netrows"
      ? "NetRows API key not configured"
      : !tweetId
        ? "block has no resolvable X post URL"
        : "tweet not retrievable from NetRows";

  // Real-data-only: never inject simulated replies into the live chain.
  // Report the skip with the raw reason instead.
  const skipped: SyncResult = {
    mode: "skipped",
    author: username,
    fetched: 0,
    created: 0,
    valid: 0,
    rejected: 0,
    duplicates: 0,
    message: `Skipped: ${reason}.`,
  };
  await recordAudit({
    actor,
    action: "block.sync_skipped",
    entity: "block",
    entityId: block.id,
    detail: JSON.stringify(skipped),
  });
  return skipped;
}

import { and, asc, desc, eq } from "drizzle-orm";
import type { Logger } from "pino";
import { db, blocksTable, type Block } from "@workspace/db";
import { emissionConfig, rewardModelConfig } from "./config";
import { computeBlockReward } from "./rewardModel";
import { broadcastApprovedPayouts } from "./broadcast";
import { generateBlockPost } from "./integrations/aias";
import { postTweet } from "./integrations/xPost";
import { settleBlock } from "./settlement";
import { syncBlockReplies } from "./netrowsSync";
import {
  getAutoPostEnabled,
  getMiningStartHeight,
  getRewardsEnabled,
  getReplySyncEnabled,
} from "./settings";
import { recordAudit } from "./audit";
import { withLock } from "./lock";

/** Evergreen topics rotated through for auto-mined blocks. */
const AUTO_TOPICS: Array<{
  title: string;
  topic: string;
  requiredKeywords: string[];
  bonusKeywords: string[];
}> = [
  {
    title: "Why verifiable beats trusted in crypto custody",
    topic: "on-chain transparency and verifiable custody",
    requiredKeywords: ["transparency", "verifiable"],
    bonusKeywords: ["merkle", "audit", "custody"],
  },
  {
    title: "One human, one voice: sybil resistance that works",
    topic: "proof of humanity and sybil resistance in rewards",
    requiredKeywords: ["proof-of-humanity", "sybil"],
    bonusKeywords: ["identity", "trust", "uniqueness"],
  },
  {
    title: "Inverted hashpower: quality over reach",
    topic: "inverted social hashpower weighting trust above reach",
    requiredKeywords: ["quality", "trust"],
    bonusKeywords: ["reach", "uniqueness"],
  },
  {
    title: "Mining with words: rewarding original signal",
    topic: "rewarding original high-signal contributions over spam",
    requiredKeywords: ["original", "signal"],
    bonusKeywords: ["spam", "filler", "substance"],
  },
];

let running = false;
let timer: NodeJS.Timeout | null = null;

async function getOpenBlock(): Promise<Block | undefined> {
  const rows = await db
    .select()
    .from(blocksTable)
    .where(eq(blocksTable.status, "open"))
    .orderBy(desc(blocksTable.seq))
    .limit(1);
  return rows[0];
}

async function getNextDraft(): Promise<Block | undefined> {
  const rows = await db
    .select()
    .from(blocksTable)
    .where(eq(blocksTable.status, "draft"))
    .orderBy(asc(blocksTable.seq))
    .limit(1);
  return rows[0];
}

async function getMaxSeq(): Promise<number> {
  const rows = await db
    .select({ seq: blocksTable.seq })
    .from(blocksTable)
    .orderBy(desc(blocksTable.seq))
    .limit(1);
  return rows[0]?.seq ?? 0;
}

async function autoCreateBlock(log?: Logger): Promise<Block> {
  // Auto-mined blocks append above the current chain tip and never go below the
  // operator-set start height. The imported @interchained posts occupy the
  // lowest heights (block 0 = earliest) as closed blocks awaiting settlement.
  const startHeight = await getMiningStartHeight();
  const seq = Math.max((await getMaxSeq()) + 1, startHeight);
  // Each auto-mined block's reward pool is pegged to the live ITC chain:
  // 10% of the governance/treasury reward summed over the last 10 real blocks
  // (see services/rewardModel). Operators can still override a block's reward.
  const reward = await computeBlockReward(log);
  const t = AUTO_TOPICS[(seq - 1) % AUTO_TOPICS.length];
  const rows = await db
    .insert(blocksTable)
    .values({
      seq,
      title: t.title,
      topic: t.topic,
      rewardItc: reward.rewardItc,
      requiredKeywords: t.requiredKeywords,
      bonusKeywords: t.bonusKeywords,
      sponsor: "Interchained Treasury (auto-mined)",
      status: "draft",
    })
    .returning();
  log?.info(
    {
      seq,
      rewardItc: reward.rewardItc,
      governanceRewardSumItc: reward.governanceRewardSumItc,
      sourceLive: reward.sourceLive,
    },
    "Auto-created mining block (governance-linked reward)",
  );
  return rows[0];
}

/**
 * After a block settles, optionally disburse its approved + wallet-bound
 * payouts on-chain automatically (mainnet). Opt-in via AUTO_BROADCAST_PAYOUTS
 * so dev / simulated runs never fire an unattended send. Failures are logged,
 * not thrown — the payouts stay "approved" and an operator can broadcast later.
 */
async function maybeAutoBroadcast(block: Block, log?: Logger): Promise<void> {
  if (!rewardModelConfig().autoBroadcast) return;
  try {
    const result = await broadcastApprovedPayouts(block, "scheduler", log);
    if (result) {
      log?.info(
        { seq: block.seq, ...result },
        "Auto-broadcast settled payouts on-chain",
      );
    }
  } catch (err) {
    log?.error({ err, seq: block.seq }, "Auto-broadcast failed; payouts remain approved");
  }
}

/**
 * Cook content, optionally post to X, and flip a draft/queued block to open.
 *
 * Serialized per-block and idempotent: the X post is sent at most once. A
 * re-read inside the lock means overlapping ticks, retries, or a re-open never
 * publish a second tweet — if the block already carries an `xPostId` we reuse
 * it instead of posting again.
 */
export async function openBlockNow(block: Block, log?: Logger): Promise<Block> {
  return withLock(`block:${block.id}`, async () => {
    // Re-read under the lock so we never act on stale post state.
    const freshRows = await db
      .select()
      .from(blocksTable)
      .where(eq(blocksTable.id, block.id))
      .limit(1);
    const fresh = freshRows[0] ?? block;

    const autoPost = await getAutoPostEnabled();
    const content =
      fresh.postContent ??
      (await generateBlockPost(
        {
          seq: fresh.seq,
          title: fresh.title,
          topic: fresh.topic,
          requiredKeywords: fresh.requiredKeywords ?? [],
          bonusKeywords: fresh.bonusKeywords ?? [],
          sponsor: fresh.sponsor,
        },
        log,
      ));

    const patch: Partial<typeof blocksTable.$inferInsert> = {
      status: "open",
      opensAt: fresh.opensAt ?? new Date().toISOString(),
      postContent: content,
    };

    if (fresh.xPostId) {
      // Already posted (auto or manual) — idempotent: never repost.
      patch.postMode = fresh.postMode ?? "manual";
      log?.info(
        { seq: fresh.seq, xPostId: fresh.xPostId },
        "Block already posted; skipping repost (idempotent)",
      );
    } else if (autoPost && fresh.postMode === "posting") {
      // A prior attempt claimed the post but never recorded an xPostId
      // (e.g. a crash between the X call and the DB write). A tweet MAY already
      // be live, so we must NOT auto-repost — hand off to manual reconciliation.
      patch.postMode = "pending_manual";
      log?.warn(
        { seq: fresh.seq },
        "In-flight post with no xPostId found; skipping auto-repost, needs manual attach",
      );
    } else if (autoPost) {
      // Claim the post in the DB *before* calling X, so a crash mid-post is
      // detectable on the next attempt (the "posting" marker above) and can
      // never silently double-post.
      await db
        .update(blocksTable)
        .set({
          status: "open",
          opensAt: patch.opensAt,
          postContent: content,
          postMode: "posting",
        })
        .where(eq(blocksTable.id, fresh.id));
      const posted = await postTweet(content, log);
      patch.xPostId = posted.id;
      patch.xPostUrl = posted.url;
      patch.xPostedAt = new Date().toISOString();
      patch.postMode = "auto";
    } else if (!fresh.xPostUrl) {
      // Semi-automated: leave unposted for an operator to share manually.
      patch.postMode = "pending_manual";
    } else {
      patch.postMode = "manual";
    }

    const rows = await db
      .update(blocksTable)
      .set(patch)
      .where(eq(blocksTable.id, fresh.id))
      .returning();
    await recordAudit({
      actor: "scheduler",
      action: "block.open",
      entity: "block",
      entityId: fresh.id,
      detail: { seq: fresh.seq, postMode: patch.postMode, autoPost },
    });
    return rows[0];
  });
}

async function settleOverdueOpen(log?: Logger): Promise<void> {
  // Respect the master reward pause: when rewards are off, blocks do not solve
  // (the countdown freezes for everyone) and nothing settles.
  if (!(await getRewardsEnabled())) return;
  const open = await getOpenBlock();
  if (!open || !open.opensAt) return;
  const cfg = emissionConfig();
  const age = Date.now() - new Date(open.opensAt).getTime();
  if (age < cfg.blockIntervalMs) return;

  const closed = await db
    .update(blocksTable)
    .set({ status: "closed", closesAt: new Date().toISOString() })
    .where(eq(blocksTable.id, open.id))
    .returning();
  await settleBlock(closed[0], log);
  log?.info({ seq: open.seq }, "Block solved (settled) on schedule");
  await maybeAutoBroadcast(closed[0], log);
}

/** One scheduler cycle: settle overdue open -> open next -> sync replies. */
export async function runTickOnce(log?: Logger): Promise<void> {
  await settleOverdueOpen(log);

  let current = await getOpenBlock();
  if (!current) {
    const next = (await getNextDraft()) ?? (await autoCreateBlock(log));
    current = await openBlockNow(next, log);
  }

  try {
    await syncBlockReplies(current, "scheduler", log);
  } catch (err) {
    log?.warn({ err }, "Scheduler sync step failed");
  }
}

export function startScheduler(log?: Logger): void {
  const cfg = emissionConfig();
  if (!cfg.schedulerEnabled) {
    log?.info("Scheduler disabled (SCHEDULER_ENABLED=false)");
    return;
  }
  if (timer) return;

  const interval = cfg.blockIntervalMs;
  const reward = rewardModelConfig();
  log?.info(
    {
      intervalMs: interval,
      rewardModel: "governance-linked",
      governanceBlocks: reward.governanceBlocks,
      governanceSharePct: reward.governanceShare * 100,
      autoBroadcast: reward.autoBroadcast,
    },
    "Block scheduler started",
  );

  timer = setInterval(() => {
    if (running) return;
    running = true;
    runTickOnce(log)
      .catch((err) => log?.error({ err }, "Scheduler tick failed"))
      .finally(() => {
        running = false;
      });
  }, interval);
  // Do not block process exit on the scheduler.
  timer.unref?.();
}

let replySyncTimer: NodeJS.Timeout | null = null;
let replySyncRunning = false;

/** The most-recent open blocks that carry a real X post URL (the rolling sync window). */
async function getOpenBlocksToSync(limit: number): Promise<Block[]> {
  const rows = await db
    .select()
    .from(blocksTable)
    .where(eq(blocksTable.status, "open"))
    .orderBy(desc(blocksTable.seq))
    .limit(limit);
  return rows.filter((b) => Boolean(b.xPostUrl));
}

/**
 * One reply-sync cycle: refresh replies for the most-recent open blocks. Real
 * data only — never seeds simulated replies. Independent of mining/settlement,
 * so it never closes a block. Gated by the replySyncEnabled operator switch.
 */
export async function runReplySyncOnce(log?: Logger): Promise<void> {
  if (!(await getReplySyncEnabled())) return;
  const { replySyncWindow } = emissionConfig();
  const blocks = await getOpenBlocksToSync(replySyncWindow);
  let synced = 0;
  for (const block of blocks) {
    try {
      await syncBlockReplies(block, "reply-sync", log);
      synced += 1;
    } catch (err) {
      log?.warn({ err, seq: block.seq }, "Reply-sync: block sync failed");
    }
  }
  log?.info({ blocks: blocks.length, synced }, "Reply-sync cycle complete");
}

export function startReplySync(log?: Logger): void {
  if (replySyncTimer) return;
  const { replySyncIntervalMs } = emissionConfig();
  const tick = () => {
    if (replySyncRunning) return;
    replySyncRunning = true;
    runReplySyncOnce(log)
      .catch((err) => log?.error({ err }, "Reply-sync tick failed"))
      .finally(() => {
        replySyncRunning = false;
      });
  };
  replySyncTimer = setInterval(tick, replySyncIntervalMs);
  replySyncTimer.unref?.();
  // Kick an initial pass shortly after boot so a freshly-enabled sync does not
  // wait a full interval for its first run.
  setTimeout(tick, 5_000).unref?.();
  log?.info(
    { intervalMs: replySyncIntervalMs },
    "Reply-sync loop started (gated by replySyncEnabled)",
  );
}

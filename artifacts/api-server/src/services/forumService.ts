import { and, desc, eq, gt, inArray, lt, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  db,
  participantsTable,
  repliesTable,
  abuseEventsTable,
  appSettingsTable,
  forumCategoriesTable,
  forumThreadsTable,
  forumPostsTable,
  forumPostRevisionsTable,
  forumPostReactionsTable,
  forumPostFlagsTable,
  forumThreadSubscriptionsTable,
  forumNotificationsTable,
  type Participant,
  type ForumThread,
} from "@workspace/db";
import { sqlite } from "@workspace/db";
import { contentHash } from "./scoring";
import { recordAudit } from "./audit";
import {
  computeTrustLevel,
  trustLevelPolicy,
  applyBehaviorDelta,
  BEHAVIOR_DELTAS,
  type TrustLevel,
  type TrustLevelPolicy,
} from "./trustLevels";

/**
 * rKudos forum service. All forum business logic (identity, trust gating,
 * posting, reactions, flags, moderation, notifications) lives here so routes
 * stay thin. The economic path (scoring/settlement) is untouched: trust LEVELS
 * gate permissions only, and forum-native mining is off by default (see
 * isForumMiningEnabled) pending review.
 */

const MAX_BODY = 16_000;
const MIN_TITLE = 8;
const MAX_TITLE = 160;
const REACTION_KINDS: Record<string, number> = {
  kudos: 1.0,
  insightful: 1.5,
  solution_assist: 2.0,
};
const FLAG_REASONS = new Set([
  "spam",
  "abuse",
  "off_topic",
  "plagiarism",
  "reward_farming",
  "other",
]);

export class ForumError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ForumError";
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

export function slugify(raw: string): string {
  const s = (raw ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
  return s || "thread";
}

function validateTitle(raw: string): string {
  const t = (raw ?? "").replace(/\s+/g, " ").trim();
  if (t.length < MIN_TITLE || t.length > MAX_TITLE)
    throw new ForumError(400, `Title must be ${MIN_TITLE}–${MAX_TITLE} characters`);
  return t;
}

function validateBody(raw: string): string {
  const b = typeof raw === "string" ? raw : "";
  if (b.trim().length < 1 || b.length > MAX_BODY)
    throw new ForumError(400, `Body must be 1–${MAX_BODY} characters`);
  return b;
}

function hasLink(body: string): boolean {
  return /https?:\/\/\S+/i.test(body) || /\[[^\]]+\]\([^)]+\)/.test(body);
}

async function getSetting(key: string): Promise<string | null> {
  const rows = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, key)).limit(1);
  return rows[0]?.value ?? null;
}
async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insert(appSettingsTable)
    .values({ key, value, updatedAt: new Date().toISOString() })
    .onConflictDoUpdate({ target: appSettingsTable.key, set: { value, updatedAt: new Date().toISOString() } });
}

/** Forum-native mining (a forum post becoming a scored reply) is OFF by default.
 *  It touches the audited economic path, so an operator must opt in after review. */
export async function isForumMiningEnabled(): Promise<boolean> {
  return (await getSetting("forum_mining_enabled")) === "true";
}

// ── identity & trust ─────────────────────────────────────────────────────────

/** Resolve (or create) a forum-native participant bound to a mining key. These
 *  are distinct from X-sourced participants (xUserId = "mk:<hash>") and carry no
 *  economic standing until they earn it. */
export async function resolveForumParticipant(
  miningKeyHash: string,
  handle: string,
): Promise<Participant> {
  if (!miningKeyHash || typeof miningKeyHash !== "string")
    throw new ForumError(400, "miningKeyHash required");
  const sentinel = `mk:${miningKeyHash}`;
  const clean = (handle || "miner").replace(/^@/, "").slice(0, 40) || "miner";

  const found = await db
    .select()
    .from(participantsTable)
    .where(eq(participantsTable.xUserId, sentinel))
    .limit(1);
  if (found[0]) return found[0];

  const inserted = await db
    .insert(participantsTable)
    .values({ xUserId: sentinel, xHandle: clean })
    .onConflictDoNothing({ target: participantsTable.xUserId })
    .returning();
  if (inserted[0]) return inserted[0];

  const again = await db
    .select()
    .from(participantsTable)
    .where(eq(participantsTable.xUserId, sentinel))
    .limit(1);
  return again[0];
}

function ageDays(iso: string | null): number {
  if (!iso) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

export async function isModerator(participantId: string): Promise<boolean> {
  return (await getSetting(`forum_mod:${participantId}`)) === "true";
}

export async function grantModerator(participantId: string, on: boolean): Promise<void> {
  await setSetting(`forum_mod:${participantId}`, on ? "true" : "false");
}

/** Gather inputs from real DB state and resolve TL0–TL4. Permissions only. */
export async function resolveTrustLevel(participant: Participant): Promise<TrustLevel> {
  const pid = participant.id;
  const since30d = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const valid = await db
    .select({ n: sql<number>`count(*)` })
    .from(repliesTable)
    .where(and(eq(repliesTable.participantId, pid), eq(repliesTable.status, "valid")));
  const reads = await db
    .select({ n: sql<number>`count(*)` })
    .from(forumThreadSubscriptionsTable)
    .where(eq(forumThreadSubscriptionsTable.participantId, pid));
  const abuse = await db
    .select({ n: sql<number>`count(*)` })
    .from(abuseEventsTable)
    .where(and(eq(abuseEventsTable.participantId, pid), eq(abuseEventsTable.severity, "high"), gt(abuseEventsTable.createdAt, since30d)));
  const solutions = await db
    .select({ n: sql<number>`count(*)` })
    .from(forumThreadsTable)
    .innerJoin(forumPostsTable, eq(forumThreadsTable.solvedPostId, forumPostsTable.id))
    .where(eq(forumPostsTable.participantId, pid));
  const flags = await db
    .select({ resolution: forumPostFlagsTable.resolution })
    .from(forumPostFlagsTable)
    .where(eq(forumPostFlagsTable.flaggerParticipantId, pid));
  const resolved = flags.filter((f) => f.resolution === "upheld" || f.resolution === "rejected");
  const upheld = flags.filter((f) => f.resolution === "upheld").length;
  const flagAccuracy = resolved.length === 0 ? 1 : upheld / resolved.length;

  return computeTrustLevel({
    accountAgeDays: ageDays(participant.accountCreated ?? participant.createdAt),
    validReplyCount: Number(valid[0]?.n ?? 0),
    threadsReadCount: Number(reads[0]?.n ?? 0),
    walletBound: Boolean(participant.itcAddress),
    trustScore: participant.trustScore,
    highSeverityAbuse30d: Number(abuse[0]?.n ?? 0) > 0,
    solutionCount: Number(solutions[0]?.n ?? 0),
    flagAccuracy,
    operatorGrant: await isModerator(pid),
  });
}

/** Apply a behaviorScore delta and persist (clamped 0..1). The forum is the
 *  first on-platform writer of the existing 35%-weight behaviorScore lever. */
export async function applyBehaviorDeltaToParticipant(
  participantId: string,
  kind: keyof typeof BEHAVIOR_DELTAS,
): Promise<void> {
  const rows = await db
    .select({ b: participantsTable.behaviorScore })
    .from(participantsTable)
    .where(eq(participantsTable.id, participantId))
    .limit(1);
  if (!rows[0]) return;
  const next = applyBehaviorDelta(rows[0].b, BEHAVIOR_DELTAS[kind]);
  await db.update(participantsTable).set({ behaviorScore: next }).where(eq(participantsTable.id, participantId));
}

/**
 * Resonance adapter (pure): a follower-equivalent for a forum submission derived
 * from trust-weighted reactions, inverting computeReachFactor's log curve so its
 * trust gate and +30% ceiling apply unmodified.
 *   f = 10^(12 × min(Σ reactorTrust × kindWeight / 5, 1) × 0.3)
 */
export function forumFollowerEquivalent(
  reactions: Array<{ reactorTrust: number; kind: string }>,
): number {
  const sum = reactions.reduce((s, r) => s + r.reactorTrust * (REACTION_KINDS[r.kind] ?? 0), 0);
  const x = Math.min(sum / 5, 1);
  return Math.pow(10, 12 * x * 0.3);
}

// ── notifications ──────────────────────────────────────────────────────────

export async function notify(
  participantId: string,
  kind: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await db.insert(forumNotificationsTable).values({ participantId, kind, payload });
}

// ── reads ────────────────────────────────────────────────────────────────────

export async function listCategories() {
  return db
    .select()
    .from(forumCategoriesTable)
    .where(eq(forumCategoriesTable.active, true))
    .orderBy(forumCategoriesTable.sortOrder);
}

export async function listThreads(categorySlug: string, cursor?: string, limit = 30) {
  const cat = await db
    .select()
    .from(forumCategoriesTable)
    .where(eq(forumCategoriesTable.slug, categorySlug))
    .limit(1);
  if (!cat[0]) throw new ForumError(404, "Category not found");
  const where = cursor
    ? and(eq(forumThreadsTable.categoryId, cat[0].id), lt(forumThreadsTable.lastPostAt, cursor))
    : eq(forumThreadsTable.categoryId, cat[0].id);
  const rows = await db
    .select()
    .from(forumThreadsTable)
    .where(where)
    .orderBy(desc(forumThreadsTable.lastPostAt))
    .limit(Math.min(limit, 100));
  return { category: cat[0], threads: rows, nextCursor: rows.length ? rows[rows.length - 1].lastPostAt : null };
}

export async function getThread(id: string, page = 0, pageSize = 50) {
  const t = await db.select().from(forumThreadsTable).where(eq(forumThreadsTable.id, id)).limit(1);
  if (!t[0]) throw new ForumError(404, "Thread not found");
  const posts = await db
    .select({ post: forumPostsTable, handle: participantsTable.xHandle })
    .from(forumPostsTable)
    .innerJoin(participantsTable, eq(forumPostsTable.participantId, participantsTable.id))
    .where(and(eq(forumPostsTable.threadId, id), inArray(forumPostsTable.status, ["visible", "hidden_pending_review"])))
    .orderBy(forumPostsTable.createdAt)
    .limit(Math.min(pageSize, 100))
    .offset(page * pageSize);
  return { thread: t[0], posts };
}

/** FTS5 search over visible posts (bm25 ranked, with snippets). */
export function search(q: string, limit = 25) {
  const clean = (q ?? "").trim();
  if (!clean) return [];
  const stmt = sqlite.prepare(
    `SELECT post_id AS postId, thread_id AS threadId,
            snippet(forum_posts_fts, 0, '[', ']', '…', 12) AS snippet,
            bm25(forum_posts_fts) AS rank
     FROM forum_posts_fts
     WHERE forum_posts_fts MATCH ?
     ORDER BY rank
     LIMIT ?`,
  );
  // Build a safe FTS5 query: lowercase prefix tokens, implicit AND. Stripping
  // punctuation avoids MATCH syntax errors on arbitrary user input.
  const terms = clean.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean).slice(0, 10);
  if (!terms.length) return [];
  const match = terms.map((t) => `${t}*`).join(" ");
  return stmt.all(match, Math.min(limit, 50)) as Array<{
    postId: string;
    threadId: string;
    snippet: string;
    rank: number;
  }>;
}

// ── writes ───────────────────────────────────────────────────────────────────

async function enforceRate(participant: Participant, policy: TrustLevelPolicy) {
  if (policy.slowModeMs > 0) {
    const cutoff = new Date(Date.now() - policy.slowModeMs).toISOString();
    const recent = await db
      .select({ id: forumPostsTable.id })
      .from(forumPostsTable)
      .where(and(eq(forumPostsTable.participantId, participant.id), gt(forumPostsTable.createdAt, cutoff)))
      .limit(1);
    if (recent[0]) throw new ForumError(429, `Slow mode: wait ${Math.round(policy.slowModeMs / 1000)}s between posts`);
  }
  if (policy.dailyPostCap != null) {
    const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
    const today = await db
      .select({ n: sql<number>`count(*)` })
      .from(forumPostsTable)
      .where(and(eq(forumPostsTable.participantId, participant.id), gt(forumPostsTable.createdAt, dayAgo)));
    if (Number(today[0]?.n ?? 0) >= policy.dailyPostCap)
      throw new ForumError(429, `Daily post limit reached (${policy.dailyPostCap})`);
  }
}

function statusForBody(body: string, policy: TrustLevelPolicy): string {
  if (hasLink(body)) {
    if (!policy.canPostLinks) throw new ForumError(403, "Links require trust level 1+");
    if (!policy.linkPostsSkipReview) return "hidden_pending_review";
  }
  return "visible";
}

export async function createThread(
  participant: Participant,
  tl: TrustLevel,
  input: { categorySlug: string; title: string; rawMd: string },
) {
  const policy = trustLevelPolicy(tl);
  if (!policy.canCreateThreads) throw new ForumError(403, "Creating threads requires trust level 1+");
  const cat = await db.select().from(forumCategoriesTable).where(eq(forumCategoriesTable.slug, input.categorySlug)).limit(1);
  if (!cat[0] || !cat[0].active) throw new ForumError(404, "Category not found");
  if (tl < cat[0].minTrustLevel)
    throw new ForumError(403, `Category requires trust level ${cat[0].minTrustLevel}+`);
  const title = validateTitle(input.title);
  const body = validateBody(input.rawMd);
  await enforceRate(participant, policy);
  const status = statusForBody(body, policy);

  const now = new Date().toISOString();
  const threadId = randomUUID();
  await db.insert(forumThreadsTable).values({
    id: threadId,
    categoryId: cat[0].id,
    authorParticipantId: participant.id,
    title,
    slug: slugify(title),
    status: "open",
    postCount: 1,
    lastPostAt: now,
    createdAt: now,
  });
  const postId = randomUUID();
  await db.insert(forumPostsTable).values({
    id: postId,
    threadId,
    participantId: participant.id,
    miningKeyHash: participant.xUserId.startsWith("mk:") ? participant.xUserId.slice(3) : null,
    rawMd: body,
    contentHash: contentHash(body),
    status,
    createdAt: now,
  });
  await recordAudit({ actor: participant.xHandle, action: "forum.thread.create", entity: "forum_thread", entityId: threadId });
  return { threadId, postId, status };
}

export async function createPost(
  participant: Participant,
  tl: TrustLevel,
  input: { threadId: string; rawMd: string; replyToPostId?: string | null },
) {
  const policy = trustLevelPolicy(tl);
  const t = await db.select().from(forumThreadsTable).where(eq(forumThreadsTable.id, input.threadId)).limit(1);
  if (!t[0]) throw new ForumError(404, "Thread not found");
  if (t[0].status === "locked" || t[0].status === "hidden")
    throw new ForumError(403, "Thread is locked");
  const body = validateBody(input.rawMd);
  await enforceRate(participant, policy);
  const status = statusForBody(body, policy);

  const now = new Date().toISOString();
  const postId = randomUUID();
  await db.insert(forumPostsTable).values({
    id: postId,
    threadId: input.threadId,
    participantId: participant.id,
    miningKeyHash: participant.xUserId.startsWith("mk:") ? participant.xUserId.slice(3) : null,
    replyToPostId: input.replyToPostId ?? null,
    rawMd: body,
    contentHash: contentHash(body),
    status,
    createdAt: now,
  });
  // bump counters
  await db
    .update(forumThreadsTable)
    .set({ postCount: t[0].postCount + 1, lastPostAt: now })
    .where(eq(forumThreadsTable.id, input.threadId));

  // notifications: thread author + quoted author
  if (t[0].authorParticipantId !== participant.id)
    await notify(t[0].authorParticipantId, "reply", { threadId: input.threadId, postId });
  if (input.replyToPostId) {
    const q = await db.select({ pid: forumPostsTable.participantId }).from(forumPostsTable).where(eq(forumPostsTable.id, input.replyToPostId)).limit(1);
    if (q[0] && q[0].pid !== participant.id)
      await notify(q[0].pid, "quote", { threadId: input.threadId, postId });
  }
  await recordAudit({ actor: participant.xHandle, action: "forum.post.create", entity: "forum_post", entityId: postId });
  return { postId, status };
}

export async function editPost(
  participant: Participant,
  tl: TrustLevel,
  postId: string,
  rawMd: string,
) {
  const policy = trustLevelPolicy(tl);
  const p = await db.select().from(forumPostsTable).where(eq(forumPostsTable.id, postId)).limit(1);
  if (!p[0]) throw new ForumError(404, "Post not found");
  const mod = await isModerator(participant.id);
  if (p[0].participantId !== participant.id && !mod) throw new ForumError(403, "Not your post");
  if (!mod) {
    const age = Date.now() - new Date(p[0].createdAt).getTime();
    if (age > policy.editWindowMs) throw new ForumError(403, "Edit window has closed");
  }
  const body = validateBody(rawMd);
  // Preserve the prior body as a revision; editing never rescores (scores live
  // on the linked reply row, which is immutable).
  await db.insert(forumPostRevisionsTable).values({ postId, editorParticipantId: participant.id, rawMd: p[0].rawMd });
  await db
    .update(forumPostsTable)
    .set({ rawMd: body, contentHash: contentHash(body), editedAt: new Date().toISOString() })
    .where(eq(forumPostsTable.id, postId));
  await recordAudit({ actor: participant.xHandle, action: "forum.post.edit", entity: "forum_post", entityId: postId });
  return { ok: true };
}

export async function react(participant: Participant, postId: string, kind: string) {
  if (!(kind in REACTION_KINDS)) throw new ForumError(400, "Invalid reaction kind");
  const p = await db.select().from(forumPostsTable).where(eq(forumPostsTable.id, postId)).limit(1);
  if (!p[0]) throw new ForumError(404, "Post not found");
  if (p[0].participantId === participant.id) throw new ForumError(403, "Cannot react to your own post");
  await db
    .insert(forumPostReactionsTable)
    .values({ postId, participantId: participant.id, kind })
    .onConflictDoNothing();
  return { ok: true };
}

export async function flagPost(
  participant: Participant,
  tl: TrustLevel,
  postId: string,
  reason: string,
  note?: string,
) {
  if (!trustLevelPolicy(tl).canFlag) throw new ForumError(403, "Flagging requires trust level 2+");
  if (!FLAG_REASONS.has(reason)) throw new ForumError(400, "Invalid flag reason");
  const p = await db.select({ id: forumPostsTable.id }).from(forumPostsTable).where(eq(forumPostsTable.id, postId)).limit(1);
  if (!p[0]) throw new ForumError(404, "Post not found");
  try {
    await db.insert(forumPostFlagsTable).values({ postId, flaggerParticipantId: participant.id, reason, note: note ?? null });
  } catch {
    throw new ForumError(409, "You already flagged this post");
  }
  await recordAudit({ actor: participant.xHandle, action: "forum.post.flag", entity: "forum_post", entityId: postId, detail: { reason } });
  return { ok: true };
}

export async function solveThread(participant: Participant, threadId: string, postId: string) {
  const t = await db.select().from(forumThreadsTable).where(eq(forumThreadsTable.id, threadId)).limit(1);
  if (!t[0]) throw new ForumError(404, "Thread not found");
  const mod = await isModerator(participant.id);
  if (t[0].authorParticipantId !== participant.id && !mod)
    throw new ForumError(403, "Only the thread author or a moderator can mark a solution");
  const post = await db.select().from(forumPostsTable).where(and(eq(forumPostsTable.id, postId), eq(forumPostsTable.threadId, threadId))).limit(1);
  if (!post[0]) throw new ForumError(404, "Post not in this thread");
  await db.update(forumThreadsTable).set({ solvedPostId: postId }).where(eq(forumThreadsTable.id, threadId));
  // The solution author earns a behaviorScore bump + a notification.
  if (post[0].participantId !== participant.id) {
    await applyBehaviorDeltaToParticipant(post[0].participantId, "authoredSolution");
    await notify(post[0].participantId, "solved", { threadId, postId });
  }
  await recordAudit({ actor: participant.xHandle, action: "forum.thread.solve", entity: "forum_thread", entityId: threadId, detail: { postId } });
  return { ok: true };
}

export async function setSubscription(participant: Participant, threadId: string, level: string) {
  if (!["watching", "tracking", "muted"].includes(level)) throw new ForumError(400, "Invalid level");
  await db
    .insert(forumThreadSubscriptionsTable)
    .values({ participantId: participant.id, threadId, level, readCount: 1 })
    .onConflictDoUpdate({
      target: [forumThreadSubscriptionsTable.participantId, forumThreadSubscriptionsTable.threadId],
      set: { level, readCount: sql`${forumThreadSubscriptionsTable.readCount} + 1`, updatedAt: new Date().toISOString() },
    });
  return { ok: true };
}

// ── admin / moderation ─────────────────────────────────────────────────────

export async function moderateThread(threadId: string, patch: { status?: string }) {
  if (patch.status && !["open", "locked", "hidden", "pinned"].includes(patch.status))
    throw new ForumError(400, "Invalid status");
  const rows = await db.update(forumThreadsTable).set({ status: patch.status }).where(eq(forumThreadsTable.id, threadId)).returning();
  if (!rows[0]) throw new ForumError(404, "Thread not found");
  await recordAudit({ actor: "admin", action: "forum.thread.moderate", entity: "forum_thread", entityId: threadId, detail: patch });
  return rows[0];
}

export async function resolveFlag(flagId: string, resolution: "upheld" | "rejected", resolverHandle: string) {
  const f = await db.select().from(forumPostFlagsTable).where(eq(forumPostFlagsTable.id, flagId)).limit(1);
  if (!f[0]) throw new ForumError(404, "Flag not found");
  if (f[0].resolution) throw new ForumError(409, "Flag already resolved");
  await db
    .update(forumPostFlagsTable)
    .set({ resolution, resolverHandle, resolvedAt: new Date().toISOString() })
    .where(eq(forumPostFlagsTable.id, flagId));

  if (resolution === "upheld") {
    const post = await db.select().from(forumPostsTable).where(eq(forumPostsTable.id, f[0].postId)).limit(1);
    if (post[0]) {
      // Hide the post and feed the existing abuse/behavior machinery.
      await db.update(forumPostsTable).set({ status: "hidden" }).where(eq(forumPostsTable.id, f[0].postId));
      await db.insert(abuseEventsTable).values({
        participantId: post[0].participantId,
        kind: `forum_${f[0].reason}`,
        severity: f[0].reason === "spam" || f[0].reason === "reward_farming" ? "high" : "medium",
        detail: JSON.stringify({ flagId, postId: f[0].postId }),
      });
      const harsh = f[0].reason === "spam" || f[0].reason === "reward_farming";
      await applyBehaviorDeltaToParticipant(post[0].participantId, harsh ? "upheldFarmingOrSpamFlag" : "upheldOtherFlag");
      await applyBehaviorDeltaToParticipant(f[0].flaggerParticipantId, "accurateFlag");
      await notify(post[0].participantId, "mod", { postId: f[0].postId, reason: f[0].reason, action: "hidden" });
    }
  }
  await recordAudit({ actor: resolverHandle, action: "forum.flag.resolve", entity: "forum_post_flag", entityId: flagId, detail: { resolution } });
  return { ok: true };
}

export async function listOpenFlags() {
  return db
    .select({ flag: forumPostFlagsTable, post: forumPostsTable })
    .from(forumPostFlagsTable)
    .innerJoin(forumPostsTable, eq(forumPostFlagsTable.postId, forumPostsTable.id))
    .where(sql`${forumPostFlagsTable.resolution} IS NULL`)
    .orderBy(desc(forumPostFlagsTable.createdAt))
    .limit(100);
}

export async function upsertCategory(input: {
  slug: string;
  name: string;
  description?: string;
  sortOrder?: number;
  minTrustLevel?: number;
  miningEligible?: boolean;
  active?: boolean;
}) {
  await db
    .insert(forumCategoriesTable)
    .values({
      slug: input.slug,
      name: input.name,
      description: input.description ?? "",
      sortOrder: input.sortOrder ?? 50,
      minTrustLevel: input.minTrustLevel ?? 0,
      miningEligible: input.miningEligible ?? false,
      active: input.active ?? true,
    })
    .onConflictDoUpdate({
      target: forumCategoriesTable.slug,
      set: {
        name: input.name,
        description: input.description ?? "",
        sortOrder: input.sortOrder ?? 50,
        minTrustLevel: input.minTrustLevel ?? 0,
        miningEligible: input.miningEligible ?? false,
        active: input.active ?? true,
        updatedAt: new Date().toISOString(),
      },
    });
  await recordAudit({ actor: "admin", action: "forum.category.upsert", entity: "forum_category", entityId: input.slug });
  return { ok: true };
}

export async function listNotifications(participantId: string) {
  return db
    .select()
    .from(forumNotificationsTable)
    .where(eq(forumNotificationsTable.participantId, participantId))
    .orderBy(desc(forumNotificationsTable.createdAt))
    .limit(100);
}

export async function markNotificationsRead(participantId: string) {
  await db
    .update(forumNotificationsTable)
    .set({ readAt: new Date().toISOString() })
    .where(and(eq(forumNotificationsTable.participantId, participantId), sql`${forumNotificationsTable.readAt} IS NULL`));
  return { ok: true };
}

export { trustLevelPolicy };

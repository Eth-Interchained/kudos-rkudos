import { eq, and } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Logger } from "pino";
import {
  db,
  blocksTable,
  repliesTable,
  participantsTable,
  projectsTable,
  projectPostsTable,
  forumCategoriesTable,
  forumThreadsTable,
  forumPostsTable,
  type Block,
  type Reply,
  type Participant,
  type Project,
  type ProjectPost,
  type ForumCategory,
} from "@workspace/db";
import { contentHash } from "./scoring";
import { recordAudit } from "./audit";

/**
 * rKudos ↔ Kudos bridge. Materializes the mining pipeline (blocks, scored
 * replies, approved projects) into the forum's threads and posts.
 *
 * Idempotence is structural: forum_threads.block_id, forum_threads.project_id,
 * and forum_posts.reply_id are UNIQUE. Every creator below guards on those keys
 * and returns { created } so the boot sweep converges in one pass and is a
 * no-op on every boot after.
 *
 * NOTE: this module is implemented but NOT yet wired. The three insertion
 * points (scheduler.openBlockNow, replyPipeline.ingestAndScoreReply, server
 * boot) and the Direction-2 elevation flow land in PR #2.
 */

// @interchained system author for block/archive OPs. The importer only creates
// blocks (no participant), so we mint this fresh; its posts always carry a null
// miningKeyHash and are read-only on-site — it never mines.
const SYSTEM_X_USER_ID = "system:interchained";
const SYSTEM_HANDLE = "interchained";

type Created = { id: string; created: boolean };

export interface BackfillStats {
  threadsCreated: number;
  opPostsCreated: number;
  repliesMirrored: number;
  projectThreadsCreated: number;
  projectPostsCreated: number;
}

// ── small pure helpers ───────────────────────────────────────────────────────

function slugify(raw: string): string {
  const s = (raw ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return s || "thread";
}

/** Thread titles render in the index; keep them sane (the route enforces 8–160
 *  for user-created threads — this is the lenient system-materialized path). */
function clampTitle(raw: string, seq?: number): string {
  let t = (raw ?? "").replace(/\s+/g, " ").trim();
  if (t.length > 160) t = `${t.slice(0, 159)}…`;
  if (t.length < 8) t = (seq != null ? `Block #${seq} — ${t}` : t).trim();
  return (t || "Untitled thread").slice(0, 160);
}

function blockTimestamp(block: Block): string {
  return block.xPostedAt ?? block.createdAt ?? new Date().toISOString();
}

function composeDraftBody(block: Block): string {
  const lines: string[] = [];
  if (block.title) lines.push(`# ${block.title}`);
  if (block.topic) lines.push(`\n${block.topic}`);
  const req = block.requiredKeywords ?? [];
  const bonus = block.bonusKeywords ?? [];
  if (req.length) lines.push(`\n**Required:** ${req.join(", ")}`);
  if (bonus.length) lines.push(`**Bonus:** ${bonus.join(", ")}`);
  return lines.join("\n").trim() || `Block #${block.seq}`;
}

function composeProjectBody(project: Project): string {
  const parts: string[] = [project.description?.trim() || project.name];
  if (project.websiteUrl) parts.push(`\n\nWebsite: ${project.websiteUrl}`);
  return parts.join("");
}

// ── defaults / system identities ─────────────────────────────────────────────

const DEFAULT_CATEGORIES: Array<Omit<typeof forumCategoriesTable.$inferInsert, "id">> = [
  {
    slug: "mining",
    name: "Mining",
    description: "Live mining blocks — every block opens a thread; reply to mine ITC.",
    sortOrder: 0,
    minTrustLevel: 0,
    miningEligible: true,
  },
  {
    slug: "archive",
    name: "Archive",
    description: "Imported @interchained history. Read-only.",
    sortOrder: 10,
    minTrustLevel: 10, // effectively locked / read-only
    miningEligible: false,
  },
  {
    slug: "projects",
    name: "Projects",
    description: "Sponsored projects and their synced posts.",
    sortOrder: 15,
    minTrustLevel: 0,
    miningEligible: false,
  },
  {
    slug: "general",
    name: "General",
    description: "Open discussion. TL1+ to start threads.",
    sortOrder: 20,
    minTrustLevel: 1,
    miningEligible: false,
  },
];

export async function ensureForumDefaults(): Promise<void> {
  for (const c of DEFAULT_CATEGORIES) {
    await db
      .insert(forumCategoriesTable)
      .values(c)
      .onConflictDoNothing({ target: forumCategoriesTable.slug });
  }
}

async function getCategoryBySlug(slug: string): Promise<ForumCategory> {
  const rows = await db
    .select()
    .from(forumCategoriesTable)
    .where(eq(forumCategoriesTable.slug, slug))
    .limit(1);
  if (!rows[0]) {
    throw new Error(`forumBridge: category "${slug}" missing — call ensureForumDefaults() first`);
  }
  return rows[0];
}

export async function ensureSystemParticipant(): Promise<string> {
  const found = await db
    .select({ id: participantsTable.id })
    .from(participantsTable)
    .where(eq(participantsTable.xUserId, SYSTEM_X_USER_ID))
    .limit(1);
  if (found[0]) return found[0].id;

  await db
    .insert(participantsTable)
    .values({
      xUserId: SYSTEM_X_USER_ID,
      xHandle: SYSTEM_HANDLE,
      verified: true,
      // Cosmetic only; this participant never submits scored replies.
      trustScore: 1,
      behaviorScore: 1,
    })
    .onConflictDoNothing({ target: participantsTable.xUserId });

  const row = await db
    .select({ id: participantsTable.id })
    .from(participantsTable)
    .where(eq(participantsTable.xUserId, SYSTEM_X_USER_ID))
    .limit(1);
  return row[0].id;
}

async function ensureProjectParticipant(project: Project): Promise<string> {
  const sentinel = `project:${project.id}`;
  const found = await db
    .select({ id: participantsTable.id })
    .from(participantsTable)
    .where(eq(participantsTable.xUserId, sentinel))
    .limit(1);
  if (found[0]) return found[0].id;

  await db
    .insert(participantsTable)
    .values({
      xUserId: sentinel,
      xHandle: project.xHandle || project.name,
    })
    .onConflictDoNothing({ target: participantsTable.xUserId });

  const row = await db
    .select({ id: participantsTable.id })
    .from(participantsTable)
    .where(eq(participantsTable.xUserId, sentinel))
    .limit(1);
  return row[0].id;
}

// ── counters ─────────────────────────────────────────────────────────────────

async function incrementThreadCounters(threadId: string, postCreatedAt: string): Promise<void> {
  const rows = await db
    .select({
      postCount: forumThreadsTable.postCount,
      lastPostAt: forumThreadsTable.lastPostAt,
    })
    .from(forumThreadsTable)
    .where(eq(forumThreadsTable.id, threadId))
    .limit(1);
  const cur = rows[0];
  if (!cur) return;
  const lastPostAt =
    !cur.lastPostAt || postCreatedAt > cur.lastPostAt ? postCreatedAt : cur.lastPostAt;
  await db
    .update(forumThreadsTable)
    .set({ postCount: cur.postCount + 1, lastPostAt })
    .where(eq(forumThreadsTable.id, threadId));
}

// ── Direction 1: block → thread, reply → post ────────────────────────────────

/**
 * Idempotent on forum_threads.block_id. Creates the thread + its OP post
 * (authored by @interchained, read-only) and sets blocks.thread_id. Archive
 * threads (categorySlug "archive") are created locked.
 */
export async function ensureThreadForBlock(
  block: Block,
  categorySlug: string,
): Promise<Created> {
  const existing = await db
    .select({ id: forumThreadsTable.id })
    .from(forumThreadsTable)
    .where(eq(forumThreadsTable.blockId, block.id))
    .limit(1);
  if (existing[0]) return { id: existing[0].id, created: false };

  const category = await getCategoryBySlug(categorySlug);
  const systemId = await ensureSystemParticipant();
  const locked = categorySlug === "archive";
  const ts = blockTimestamp(block);

  const opBody =
    block.postContent && block.postContent.trim().length > 0
      ? block.postContent
      : composeDraftBody(block);

  const threadId = randomUUID();
  const title = clampTitle(block.title || block.topic || "", block.seq);

  await db.insert(forumThreadsTable).values({
    id: threadId,
    categoryId: category.id,
    authorParticipantId: systemId,
    title,
    slug: slugify(title),
    blockId: block.id,
    status: locked ? "locked" : "open",
    postCount: 1,
    lastPostAt: ts,
    createdAt: ts,
  });

  await db.insert(forumPostsTable).values({
    threadId,
    participantId: systemId,
    miningKeyHash: null, // system OP → read-only
    rawMd: opBody,
    contentHash: contentHash(opBody),
    status: "visible",
    createdAt: ts,
  });

  await db.update(blocksTable).set({ threadId }).where(eq(blocksTable.id, block.id));

  await recordAudit({
    action: "forum.thread.materialized",
    entity: "forum_thread",
    entityId: threadId,
    detail: { blockId: block.id, seq: block.seq, category: categorySlug },
  });

  return { id: threadId, created: true };
}

/**
 * Idempotent on forum_posts.reply_id. Mirrors a scored reply into the block's
 * thread. miningKeyHash null (X-sourced/backfilled) → read-only post. Mirrors
 * the reply's flag state (flagged → hidden_pending_review). Returns null only
 * if the block's thread does not exist yet (caller must ensure it first).
 */
export async function mirrorReplyToPost(
  block: Block,
  reply: Reply,
  participant: Participant,
  miningKeyHash: string | null,
): Promise<Created | null> {
  const threadRows = await db
    .select({ id: forumThreadsTable.id })
    .from(forumThreadsTable)
    .where(eq(forumThreadsTable.blockId, block.id))
    .limit(1);
  const threadId = threadRows[0]?.id;
  if (!threadId) return null;

  const existing = await db
    .select({ id: forumPostsTable.id })
    .from(forumPostsTable)
    .where(eq(forumPostsTable.replyId, reply.id))
    .limit(1);
  if (existing[0]) return { id: existing[0].id, created: false };

  const body = reply.replyText ?? "";
  const createdAt = reply.createdAt ?? new Date().toISOString();
  const postId = randomUUID();

  await db.insert(forumPostsTable).values({
    id: postId,
    threadId,
    participantId: participant.id,
    miningKeyHash,
    rawMd: body,
    contentHash: reply.contentHash || contentHash(body),
    replyId: reply.id, // submission bridge (UNIQUE) — scores stay on the reply row
    status: reply.flagged ? "hidden_pending_review" : "visible",
    createdAt,
  });

  await incrementThreadCounters(threadId, createdAt);
  return { id: postId, created: true };
}

// ── Projects backfill ────────────────────────────────────────────────────────

async function ensureThreadForProject(
  project: Project,
  categoryId: string,
): Promise<Created> {
  const existing = await db
    .select({ id: forumThreadsTable.id })
    .from(forumThreadsTable)
    .where(eq(forumThreadsTable.projectId, project.id))
    .limit(1);
  if (existing[0]) return { id: existing[0].id, created: false };

  const authorId = await ensureProjectParticipant(project);
  const ts = project.appliedAt ?? project.createdAt ?? new Date().toISOString();
  const threadId = randomUUID();
  const title = clampTitle(project.name || "Project");
  const body = composeProjectBody(project);

  await db.insert(forumThreadsTable).values({
    id: threadId,
    categoryId,
    authorParticipantId: authorId,
    title,
    slug: slugify(title),
    projectId: project.id,
    status: "open",
    postCount: 1,
    lastPostAt: ts,
    createdAt: ts,
  });

  await db.insert(forumPostsTable).values({
    threadId,
    participantId: authorId,
    miningKeyHash: null, // read-only
    rawMd: body,
    contentHash: contentHash(body),
    status: "visible",
    createdAt: ts,
  });

  await recordAudit({
    action: "forum.thread.materialized",
    entity: "forum_thread",
    entityId: threadId,
    detail: { projectId: project.id, category: "projects" },
  });

  return { id: threadId, created: true };
}

/**
 * Idempotent within a project thread via a contentHash guard (forum_posts has
 * no source-post column by design). Two project posts with byte-identical text
 * collapse to one — acceptable for read-only mirrors.
 */
async function mirrorProjectPost(
  threadId: string,
  authorParticipantId: string,
  pp: ProjectPost,
): Promise<Created> {
  const ch = contentHash(pp.text ?? "");
  const existing = await db
    .select({ id: forumPostsTable.id })
    .from(forumPostsTable)
    .where(and(eq(forumPostsTable.threadId, threadId), eq(forumPostsTable.contentHash, ch)))
    .limit(1);
  if (existing[0]) return { id: existing[0].id, created: false };

  const createdAt = pp.syncedAt ?? new Date().toISOString();
  const postId = randomUUID();
  await db.insert(forumPostsTable).values({
    id: postId,
    threadId,
    participantId: authorParticipantId,
    miningKeyHash: null, // read-only mirror of a synced X post
    rawMd: pp.text ?? "",
    contentHash: ch,
    status: "visible",
    createdAt,
  });

  await incrementThreadCounters(threadId, createdAt);
  return { id: postId, created: true };
}

export async function backfillProjects(): Promise<{
  projectThreadsCreated: number;
  projectPostsCreated: number;
}> {
  const projectsCat = await getCategoryBySlug("projects");
  const approved = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.status, "approved"));

  let projectThreadsCreated = 0;
  let projectPostsCreated = 0;

  for (const project of approved) {
    const thread = await ensureThreadForProject(project, projectsCat.id);
    if (thread.created) projectThreadsCreated += 1;
    const authorId = await ensureProjectParticipant(project);

    const pposts = await db
      .select()
      .from(projectPostsTable)
      .where(eq(projectPostsTable.projectId, project.id));
    for (const pp of pposts) {
      const post = await mirrorProjectPost(thread.id, authorId, pp);
      if (post.created) projectPostsCreated += 1;
    }
  }

  return { projectThreadsCreated, projectPostsCreated };
}

// ── Boot sweep ───────────────────────────────────────────────────────────────

/**
 * One-pass boot backfill: seed defaults → every block without a thread (Archive
 * below miningStartHeight, Mining at/above) → all its scored replies → projects.
 * Converges once; a no-op on every boot after (all UNIQUE-guarded).
 */
export async function backfillForumFromBlocks(
  miningStartHeight: number,
  log?: Logger,
): Promise<BackfillStats> {
  await ensureForumDefaults();
  await ensureSystemParticipant();

  const blocks = await db.select().from(blocksTable);

  let threadsCreated = 0;
  let repliesMirrored = 0;

  for (const block of blocks) {
    const categorySlug = block.seq < miningStartHeight ? "archive" : "mining";
    const thread = await ensureThreadForBlock(block, categorySlug);
    if (thread.created) threadsCreated += 1;

    const replyRows = await db
      .select({ reply: repliesTable, participant: participantsTable })
      .from(repliesTable)
      .innerJoin(participantsTable, eq(repliesTable.participantId, participantsTable.id))
      .where(eq(repliesTable.blockId, block.id));

    for (const r of replyRows) {
      // Backfilled replies are X-sourced (the forum did not exist when they
      // were scored), so they mirror as read-only posts (null mining key).
      const post = await mirrorReplyToPost(block, r.reply, r.participant, null);
      if (post?.created) repliesMirrored += 1;
    }
  }

  const projects = await backfillProjects();

  const stats: BackfillStats = {
    threadsCreated,
    opPostsCreated: threadsCreated, // each new thread inserts exactly one OP
    repliesMirrored,
    ...projects,
  };

  log?.info(stats, "rKudos backfill complete");
  return stats;
}

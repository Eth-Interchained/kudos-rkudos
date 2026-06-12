import type { Logger } from "pino";
import { and, asc, eq, inArray } from "drizzle-orm";
import {
  db,
  forumThreadsTable,
  forumPostsTable,
  forumPostFlagsTable,
} from "@workspace/db";
import { aiasChat } from "./integrations/aias";
import { search } from "./forumService";

/**
 * rKudos agentic layer (AiAS-backed). All outputs degrade to { available:false }
 * when AiAS is unconfigured or unreachable — never a fabricated summary/answer.
 * Nothing here mutates economic state; triage is advisory only.
 */

export async function summarizeThread(threadId: string, log?: Logger) {
  const t = await db.select().from(forumThreadsTable).where(eq(forumThreadsTable.id, threadId)).limit(1);
  if (!t[0]) return { available: false as const, error: "Thread not found" };
  const posts = await db
    .select()
    .from(forumPostsTable)
    .where(and(eq(forumPostsTable.threadId, threadId), eq(forumPostsTable.status, "visible")))
    .orderBy(asc(forumPostsTable.createdAt))
    .limit(40);
  const transcript = posts.map((p, i) => `#${i + 1}: ${p.rawMd.slice(0, 600)}`).join("\n\n");
  const summary = await aiasChat(
    [
      {
        role: "system",
        content:
          "You are AiAS summarizing a forum thread for the Interchained Kudos community. Be concise and neutral: 3-5 sentences capturing the key points and any consensus or open questions.",
      },
      { role: "user", content: `THREAD: ${t[0].title}\n\n${transcript}` },
    ],
    { maxTokens: 320, temperature: 0.3 },
    log,
  );
  return summary ? { available: true as const, summary } : { available: false as const };
}

export async function askThread(threadId: string, question: string, log?: Logger) {
  const q = (question || "").trim();
  if (!q) return { available: false as const, error: "question required" };
  const hits = search(q, 8); // corpus retrieval over visible posts (FTS5)
  const ctxPosts = hits.length
    ? await db.select().from(forumPostsTable).where(inArray(forumPostsTable.id, hits.map((hh) => hh.postId)))
    : [];
  const byId = new Map(ctxPosts.map((p) => [p.id, p]));
  const context = hits
    .map((hit, i) => `[${i + 1}] ${(byId.get(hit.postId)?.rawMd ?? "").slice(0, 500)}`)
    .join("\n\n");
  const answer = await aiasChat(
    [
      {
        role: "system",
        content:
          "You are AiAS answering a question using ONLY the provided forum context. If the context is insufficient, say so plainly. Cite sources by their [n] index. Be concise.",
      },
      { role: "user", content: `QUESTION: ${q}\n\nCONTEXT:\n${context || "(no relevant posts found)"}` },
    ],
    { maxTokens: 400, temperature: 0.2 },
    log,
  );
  if (!answer) return { available: false as const };
  return {
    available: true as const,
    answer,
    sources: hits.map((hit) => ({ postId: hit.postId, threadId: hit.threadId, snippet: hit.snippet })),
  };
}

export async function relatedThreads(threadId: string) {
  const op = await db
    .select()
    .from(forumPostsTable)
    .where(eq(forumPostsTable.threadId, threadId))
    .orderBy(asc(forumPostsTable.createdAt))
    .limit(1);
  if (!op[0]) return [];
  const terms = op[0].rawMd
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 8)
    .join(" ");
  if (!terms.trim()) return [];
  const hits = search(terms, 20);
  const otherThreadIds = Array.from(new Set(hits.map((hh) => hh.threadId)))
    .filter((id) => id !== threadId)
    .slice(0, 6);
  if (!otherThreadIds.length) return [];
  return db
    .select({
      id: forumThreadsTable.id,
      title: forumThreadsTable.title,
      slug: forumThreadsTable.slug,
      postCount: forumThreadsTable.postCount,
      lastPostAt: forumThreadsTable.lastPostAt,
    })
    .from(forumThreadsTable)
    .where(inArray(forumThreadsTable.id, otherThreadIds));
}

export async function triageFlag(flagId: string, log?: Logger) {
  const f = await db.select().from(forumPostFlagsTable).where(eq(forumPostFlagsTable.id, flagId)).limit(1);
  if (!f[0]) return { available: false as const, error: "Flag not found" };
  const p = await db.select().from(forumPostsTable).where(eq(forumPostsTable.id, f[0].postId)).limit(1);
  if (!p[0]) return { available: false as const, error: "Post not found" };
  const suggestion = await aiasChat(
    [
      {
        role: "system",
        content:
          'You are AiAS, an ADVISORY moderation assistant. Given a flagged forum post and the flag reason, suggest "uphold" or "reject" with a one-sentence rationale. Output strictly JSON: {"suggest":"uphold|reject","rationale":"..."}. You never take action — a human decides.',
      },
      { role: "user", content: `REASON: ${f[0].reason}\nNOTE: ${f[0].note ?? ""}\n\nPOST:\n${p[0].rawMd.slice(0, 1500)}` },
    ],
    { maxTokens: 160, temperature: 0 },
    log,
  );
  return suggestion ? { available: true as const, suggestion } : { available: false as const };
}

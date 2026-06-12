import { Router, type IRouter, type Request, type Response } from "express";
import { eq, desc } from "drizzle-orm";
import { requireAdmin } from "../middleware/adminAuth";
import { db, forumPostsTable, participantsTable } from "@workspace/db";
import { hashpitBus, type ChatMsg } from "../services/hashpitBus";
import * as forum from "../services/forumService";
import * as agent from "../services/forumAgent";

const router: IRouter = Router();

/** Resolve the acting forum participant + trust level from mining-key identity. */
async function actor(req: Request, fromQuery = false) {
  const src = fromQuery ? req.query : req.body ?? {};
  const miningKeyHash = String(src.miningKeyHash ?? "");
  const handle = String(src.handle ?? "");
  if (!miningKeyHash) throw new forum.ForumError(400, "miningKeyHash required");
  const participant = await forum.resolveForumParticipant(miningKeyHash, handle);
  const tl = await forum.resolveTrustLevel(participant);
  return { participant, tl };
}

/** Wrap an async handler; map ForumError to its status, else 500 via next(). */
function h(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response) => {
    fn(req, res).catch((err) => {
      if (err instanceof forum.ForumError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      req.log?.error({ err }, "forum route error");
      res.status(500).json({ error: "Internal error" });
    });
  };
}

function emitThread(threadId: string, handle: string) {
  const msg: ChatMsg = {
    id: `${Date.now()}`,
    channel: `thread:${threadId}`,
    handle,
    body: "",
    kind: "system",
    miningKeyHash: null,
    createdAt: new Date().toISOString(),
  };
  hashpitBus.emit(`thread:${threadId}`, msg);
}

// ── public reads ──────────────────────────────────────────────────────────

router.get("/forum/categories", h(async (_req, res) => {
  res.json(await forum.listCategories());
}));

router.get("/forum/categories/:slug/threads", h(async (req, res) => {
  const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
  res.json(await forum.listThreads(req.params.slug, cursor));
}));

router.get("/forum/threads/:id", h(async (req, res) => {
  const page = Number(req.query.page ?? 0);
  res.json(await forum.getThread(req.params.id, Number.isFinite(page) ? page : 0));
}));

router.get("/forum/search", h(async (req, res) => {
  res.json(forum.search(String(req.query.q ?? "")));
}));

router.get("/forum/threads/:id/related", h(async (req, res) => {
  res.json(await agent.relatedThreads(req.params.id));
}));

// ── SSE thread stream (reuses the hashpit bus, channel thread:<id>) ─────────

router.get("/forum/threads/:id/stream", h(async (req, res) => {
  const threadId = req.params.id;
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();

  const recent = await db
    .select({ post: forumPostsTable, handle: participantsTable.xHandle })
    .from(forumPostsTable)
    .innerJoin(participantsTable, eq(forumPostsTable.participantId, participantsTable.id))
    .where(eq(forumPostsTable.threadId, threadId))
    .orderBy(desc(forumPostsTable.createdAt))
    .limit(20);
  res.write(`event: init\ndata: ${JSON.stringify(recent.reverse())}\n\n`);

  const unsubscribe = hashpitBus.subscribe(`thread:${threadId}`, (msg) => {
    res.write(`event: activity\ndata: ${JSON.stringify(msg)}\n\n`);
  });
  const hb = setInterval(() => res.write(`event: ping\ndata: {}\n\n`), 25_000);
  req.on("close", () => {
    unsubscribe();
    clearInterval(hb);
  });
}));

// ── miner writes (mining-key identity + TL gates) ───────────────────────────

router.post("/forum/threads", h(async (req, res) => {
  const { participant, tl } = await actor(req);
  const out = await forum.createThread(participant, tl, {
    categorySlug: String(req.body?.categorySlug ?? ""),
    title: String(req.body?.title ?? ""),
    rawMd: String(req.body?.rawMd ?? ""),
  });
  res.status(201).json(out);
}));

router.post("/forum/threads/:id/posts", h(async (req, res) => {
  const { participant, tl } = await actor(req);
  const out = await forum.createPost(participant, tl, {
    threadId: req.params.id,
    rawMd: String(req.body?.rawMd ?? ""),
    replyToPostId: req.body?.replyToPostId ?? null,
  });
  emitThread(req.params.id, participant.xHandle);
  res.status(201).json(out);
}));

router.patch("/forum/posts/:id", h(async (req, res) => {
  const { participant, tl } = await actor(req);
  res.json(await forum.editPost(participant, tl, req.params.id, String(req.body?.rawMd ?? "")));
}));

router.post("/forum/posts/:id/reactions", h(async (req, res) => {
  const { participant } = await actor(req);
  res.json(await forum.react(participant, req.params.id, String(req.body?.kind ?? "")));
}));

router.post("/forum/posts/:id/flags", h(async (req, res) => {
  const { participant, tl } = await actor(req);
  res.json(await forum.flagPost(participant, tl, req.params.id, String(req.body?.reason ?? ""), req.body?.note));
}));

router.post("/forum/threads/:id/solve", h(async (req, res) => {
  const { participant } = await actor(req);
  res.json(await forum.solveThread(participant, req.params.id, String(req.body?.postId ?? "")));
}));

router.put("/forum/threads/:id/subscription", h(async (req, res) => {
  const { participant } = await actor(req);
  res.json(await forum.setSubscription(participant, req.params.id, String(req.body?.level ?? "watching")));
}));

router.get("/forum/notifications", h(async (req, res) => {
  const { participant } = await actor(req, true);
  res.json(await forum.listNotifications(participant.id));
}));

router.post("/forum/notifications/read", h(async (req, res) => {
  const { participant } = await actor(req);
  res.json(await forum.markNotificationsRead(participant.id));
}));

// ── agentic (AiAS-backed; degrade gracefully when unconfigured) ─────────────

router.post("/forum/threads/:id/summarize", h(async (req, res) => {
  res.json(await agent.summarizeThread(req.params.id, req.log));
}));

router.post("/forum/threads/:id/ask", h(async (req, res) => {
  res.json(await agent.askThread(req.params.id, String(req.body?.question ?? ""), req.log));
}));

// ── admin / moderation ──────────────────────────────────────────────────────

router.get("/forum/flags", requireAdmin, h(async (_req, res) => {
  res.json(await forum.listOpenFlags());
}));

router.patch("/forum/threads/:id", requireAdmin, h(async (req, res) => {
  res.json(await forum.moderateThread(req.params.id, { status: req.body?.status }));
}));

router.post("/forum/flags/:id/resolve", requireAdmin, h(async (req, res) => {
  const resolution = req.body?.resolution === "upheld" ? "upheld" : "rejected";
  res.json(await forum.resolveFlag(req.params.id, resolution, "admin"));
}));

router.post("/forum/flags/:id/triage", requireAdmin, h(async (req, res) => {
  res.json(await agent.triageFlag(req.params.id, req.log));
}));

router.post("/forum/categories", requireAdmin, h(async (req, res) => {
  res.json(await forum.upsertCategory(req.body ?? {}));
}));

router.post("/forum/moderators", requireAdmin, h(async (req, res) => {
  const pid = String(req.body?.participantId ?? "");
  if (!pid) throw new forum.ForumError(400, "participantId required");
  await forum.grantModerator(pid, req.body?.on !== false);
  res.json({ ok: true });
}));

router.post("/forum/threads/:id/elevate", requireAdmin, h(async (_req, res) => {
  // Direction 2 (thread → mining block) touches the treasury path and lands in a
  // dedicated follow-up once forum-native mining is reviewed and enabled.
  res.status(501).json({ error: "Thread elevation is not enabled yet (pending economic review)." });
}));

export default router;

import { Router, type IRouter, type Request, type Response } from "express";
import { eq, desc, and, gt } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, hashpitMessagesTable } from "@workspace/db";
import { getBlockBySeq } from "../services/queries";
import { hashpitBus, type ChatMsg } from "../services/hashpitBus";

const router: IRouter = Router();

const SLOW_MODE_MS = 15_000;
const HISTORY_LIMIT = 100;
const SSE_INIT_LIMIT = 50;
const COUNT_INTERVAL_MS = 10_000;

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolve a channel param like "block-3" or "lobby" to an internal channel key
 * and optionally the block row for validation.
 */
async function resolveChannel(channelParam: string) {
  if (channelParam === "lobby") {
    return { channel: "lobby", block: null } as const;
  }

  const match = channelParam.match(/^block-(\d+)$/);
  if (!match) return null;

  const seq = parseInt(match[1], 10);
  const block = await getBlockBySeq(seq);
  if (!block) return null;

  return { channel: `block:${block.id}`, block } as const;
}

function rowToMsg(row: typeof hashpitMessagesTable.$inferSelect): ChatMsg {
  return {
    id: row.id,
    channel: row.channel,
    handle: row.handle,
    body: row.body,
    kind: row.kind as "chat" | "system",
    miningKeyHash: row.miningKeyHash,
    createdAt: row.createdAt,
  };
}

// ── GET /hashpit/:channel/stream — SSE ───────────────────────────────────────

router.get("/hashpit/:channel/stream", async (req: Request, res: Response) => {
  const resolved = await resolveChannel(req.params.channel as string);
  if (!resolved) {
    res.status(404).json({ error: "Unknown channel" });
    return;
  }

  const { channel } = resolved;

  // SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // nginx proxy fix
  });
  res.flushHeaders();

  // Send initial history burst
  const history = await db
    .select()
    .from(hashpitMessagesTable)
    .where(eq(hashpitMessagesTable.channel, channel))
    .orderBy(desc(hashpitMessagesTable.createdAt))
    .limit(SSE_INIT_LIMIT);

  const initMsgs = history.reverse().map(rowToMsg);
  res.write(`event: init\ndata: ${JSON.stringify(initMsgs)}\n\n`);

  // Subscribe to new messages
  const unsubscribe = hashpitBus.subscribe(channel, (msg) => {
    res.write(`event: msg\ndata: ${JSON.stringify(msg)}\n\n`);
  });

  // Periodic miner count
  const countInterval = setInterval(() => {
    const count = hashpitBus.getClientCount(channel);
    res.write(`event: count\ndata: ${JSON.stringify({ miners: count })}\n\n`);
  }, COUNT_INTERVAL_MS);

  // Send initial count immediately
  res.write(
    `event: count\ndata: ${JSON.stringify({ miners: hashpitBus.getClientCount(channel) })}\n\n`,
  );

  // Cleanup on disconnect
  req.on("close", () => {
    unsubscribe();
    clearInterval(countInterval);
  });
});

// ── POST /hashpit/:channel/msg — Send message ───────────────────────────────

router.post("/hashpit/:channel/msg", async (req: Request, res: Response) => {
  const resolved = await resolveChannel(req.params.channel as string);
  if (!resolved) {
    res.status(404).json({ error: "Unknown channel" });
    return;
  }

  const { channel, block } = resolved;

  // Block channels: must be open
  if (block && block.status !== "open") {
    res.status(403).json({ error: "Block is closed. Hashpit is read-only." });
    return;
  }

  const { miningKeyHash, handle, body } = req.body ?? {};

  if (!miningKeyHash || typeof miningKeyHash !== "string") {
    res.status(400).json({ error: "miningKeyHash required" });
    return;
  }
  if (!handle || typeof handle !== "string") {
    res.status(400).json({ error: "handle required" });
    return;
  }
  const trimmedBody = typeof body === "string" ? body.trim() : "";
  if (!trimmedBody || trimmedBody.length > 280) {
    res.status(400).json({ error: "body must be 1–280 characters" });
    return;
  }

  // Slow mode check — last message from this mining key in this channel
  const cutoff = new Date(Date.now() - SLOW_MODE_MS).toISOString();
  const recent = await db
    .select({ id: hashpitMessagesTable.id })
    .from(hashpitMessagesTable)
    .where(
      and(
        eq(hashpitMessagesTable.channel, channel),
        eq(hashpitMessagesTable.miningKeyHash, miningKeyHash),
        gt(hashpitMessagesTable.createdAt, cutoff),
      ),
    )
    .limit(1);

  if (recent.length > 0) {
    res.status(429).json({
      error: "Slow mode active",
      retryAfterMs: SLOW_MODE_MS,
    });
    return;
  }

  // Insert
  const now = new Date().toISOString();
  const id = randomUUID();
  await db.insert(hashpitMessagesTable).values({
    id,
    channel,
    miningKeyHash,
    handle: handle.replace(/^@/, ""),
    kind: "chat",
    body: trimmedBody,
    createdAt: now,
  });

  const msg: ChatMsg = {
    id,
    channel,
    handle: handle.replace(/^@/, ""),
    body: trimmedBody,
    kind: "chat",
    miningKeyHash,
    createdAt: now,
  };

  // Broadcast
  hashpitBus.emit(channel, msg);

  res.json({ ok: true, message: msg });
});

// ── GET /hashpit/:channel/messages — REST history ────────────────────────────

router.get("/hashpit/:channel/messages", async (req: Request, res: Response) => {
  const resolved = await resolveChannel(req.params.channel as string);
  if (!resolved) {
    res.status(404).json({ error: "Unknown channel" });
    return;
  }

  const rows = await db
    .select()
    .from(hashpitMessagesTable)
    .where(eq(hashpitMessagesTable.channel, resolved.channel))
    .orderBy(desc(hashpitMessagesTable.createdAt))
    .limit(HISTORY_LIMIT);

  res.json(rows.reverse().map(rowToMsg));
});

export default router;

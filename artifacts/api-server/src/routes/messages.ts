import { Router, type IRouter } from "express";
import { eq, or, and, desc } from "drizzle-orm";
import { db, messagesTable, participantsTable } from "@workspace/db";

const router: IRouter = Router();

/**
 * Require miningKeyHash query param for auth.
 * Returns 401 if missing.
 */
function extractHash(req: { query: Record<string, unknown> }): string | null {
  const h = req.query.hash;
  return typeof h === "string" && h.length >= 16 ? h : null;
}

// ── GET /messages/inbox ────────────────────────────────────────────────────
// Returns all conversations grouped by partner, most recent first.
router.get("/messages/inbox", async (req, res) => {
  const myHash = extractHash(req as any);
  if (!myHash) {
    res.status(401).json({ error: "Missing or invalid mining key hash" });
    return;
  }

  const rows = await db
    .select()
    .from(messagesTable)
    .where(
      or(
        eq(messagesTable.fromHash, myHash),
        eq(messagesTable.toHash, myHash),
      ),
    )
    .orderBy(desc(messagesTable.createdAt));

  // Group into threads by the other party
  const threads: Record<string, {
    partnerHash: string;
    partnerHandle: string;
    lastMessage: typeof rows[0];
    unreadCount: number;
    messageCount: number;
  }> = {};

  for (const msg of rows) {
    const isIncoming = msg.toHash === myHash;
    const partnerHash = isIncoming ? msg.fromHash : msg.toHash;
    const partnerHandle = isIncoming ? msg.fromHandle : msg.toHandle;

    if (!threads[partnerHash]) {
      threads[partnerHash] = {
        partnerHash,
        partnerHandle,
        lastMessage: msg,
        unreadCount: 0,
        messageCount: 0,
      };
    }
    threads[partnerHash].messageCount++;
    if (isIncoming && !msg.read) {
      threads[partnerHash].unreadCount++;
    }
  }

  res.json(Object.values(threads).sort((a, b) =>
    new Date(b.lastMessage.createdAt).getTime() - new Date(a.lastMessage.createdAt).getTime()
  ));
});

// ── GET /messages/thread/:partnerHash ──────────────────────────────────────
// Returns all messages between the authenticated user and the partner.
router.get("/messages/thread/:partnerHash", async (req, res) => {
  const myHash = extractHash(req as any);
  if (!myHash) {
    res.status(401).json({ error: "Missing or invalid mining key hash" });
    return;
  }

  const partnerHash = req.params.partnerHash;

  const rows = await db
    .select()
    .from(messagesTable)
    .where(
      or(
        and(eq(messagesTable.fromHash, myHash), eq(messagesTable.toHash, partnerHash)),
        and(eq(messagesTable.fromHash, partnerHash), eq(messagesTable.toHash, myHash)),
      ),
    )
    .orderBy(messagesTable.createdAt);

  // Mark incoming messages as read
  await db
    .update(messagesTable)
    .set({ read: 1 })
    .where(
      and(
        eq(messagesTable.fromHash, partnerHash),
        eq(messagesTable.toHash, myHash),
        eq(messagesTable.read, 0),
      ),
    );

  res.json(rows);
});

// ── POST /messages ────────────────────────────────────────────────────────
// Send a DM. Body is expected to be encrypted client-side.
router.post("/messages", async (req, res) => {
  const { fromHash, fromHandle, toHandle, body } = req.body ?? {};

  if (!fromHash || !fromHandle || !toHandle || !body) {
    res.status(400).json({ error: "Missing required fields: fromHash, fromHandle, toHandle, body" });
    return;
  }

  if (typeof body !== "string" || body.length > 5000) {
    res.status(400).json({ error: "Message body too long (max 5000 chars)" });
    return;
  }

  // Resolve recipient's miningKeyHash from their handle
  const recipient = await db
    .select({ miningKeyHash: participantsTable.miningKeyHash })
    .from(participantsTable)
    .where(eq(participantsTable.xHandle, toHandle.replace(/^@/, "")))
    .limit(1);

  const toHash = recipient[0]?.miningKeyHash;
  if (!toHash) {
    res.status(404).json({ error: `Miner @${toHandle} not found or has no mining key.` });
    return;
  }

  if (fromHash === toHash) {
    res.status(400).json({ error: "Can't DM yourself, miner. Go touch grass. 🌱" });
    return;
  }

  const [msg] = await db
    .insert(messagesTable)
    .values({
      fromHash,
      toHash,
      fromHandle: fromHandle.replace(/^@/, ""),
      toHandle: toHandle.replace(/^@/, ""),
      body,
    })
    .returning();

  res.status(201).json(msg);
});

// ── GET /messages/unread-count ─────────────────────────────────────────────
// Returns total unread count for badge display.
router.get("/messages/unread-count", async (req, res) => {
  const myHash = extractHash(req as any);
  if (!myHash) {
    res.status(401).json({ error: "Missing or invalid mining key hash" });
    return;
  }

  const rows = await db
    .select()
    .from(messagesTable)
    .where(
      and(
        eq(messagesTable.toHash, myHash),
        eq(messagesTable.read, 0),
      ),
    );

  res.json({ count: rows.length });
});

export default router;

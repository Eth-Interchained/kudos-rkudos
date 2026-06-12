import { Router } from "express";
import { eq, asc, desc } from "drizzle-orm";
import { db, topicsTable } from "@workspace/db";
import { listTopics } from "../services/topicRotation";
import { recordAudit } from "../services/audit";

const router = Router();

/**
 * GET /admin/topics — list all topics (active + inactive) sorted by sort_order.
 */
router.get("/admin/topics", async (_req, res) => {
  const topics = await listTopics();
  res.json(topics);
});

/**
 * PUT /admin/topics/reorder — bulk reorder topics.
 * Body: { ids: string[] } — topic IDs in desired order.
 * MUST be registered before /:id to avoid matching "reorder" as an id.
 */
router.put("/admin/topics/reorder", async (req, res) => {
  const { ids } = req.body ?? {};
  if (!Array.isArray(ids)) {
    res.status(400).json({ error: "ids array required" });
    return;
  }

  for (let i = 0; i < ids.length; i++) {
    await db
      .update(topicsTable)
      .set({ sortOrder: i, updatedAt: new Date().toISOString() })
      .where(eq(topicsTable.id, ids[i]));
  }

  await recordAudit({
    actor: "admin",
    action: "topic.reorder",
    entity: "topic",
    entityId: null,
    detail: { count: ids.length },
  });

  const updated = await db
    .select()
    .from(topicsTable)
    .orderBy(asc(topicsTable.sortOrder));
  res.json(updated);
});

/**
 * POST /admin/topics — create a new topic.
 */
router.post("/admin/topics", async (req, res) => {
  const { title, topic, requiredKeywords, bonusKeywords } = req.body ?? {};
  if (!title || typeof title !== "string") {
    res.status(400).json({ error: "title is required" });
    return;
  }

  const last = await db
    .select({ sortOrder: topicsTable.sortOrder })
    .from(topicsTable)
    .orderBy(desc(topicsTable.sortOrder))
    .limit(1);
  const nextOrder = (last[0]?.sortOrder ?? -1) + 1;

  const now = new Date().toISOString();
  const rows = await db
    .insert(topicsTable)
    .values({
      title: title.trim(),
      topic: (topic ?? "").trim(),
      requiredKeywords: Array.isArray(requiredKeywords) ? requiredKeywords : [],
      bonusKeywords: Array.isArray(bonusKeywords) ? bonusKeywords : [],
      sortOrder: nextOrder,
      active: true,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  await recordAudit({
    actor: "admin",
    action: "topic.create",
    entity: "topic",
    entityId: rows[0].id,
    detail: { title: rows[0].title },
  });

  res.status(201).json(rows[0]);
});

/**
 * PUT /admin/topics/:id — update a topic.
 */
router.put("/admin/topics/:id", async (req, res) => {
  const id = req.params.id as string;
  const { title, topic, requiredKeywords, bonusKeywords, active, sortOrder } =
    req.body ?? {};

  const patch: Partial<typeof topicsTable.$inferInsert> = {
    updatedAt: new Date().toISOString(),
  };
  if (title !== undefined) patch.title = String(title).trim();
  if (topic !== undefined) patch.topic = String(topic).trim();
  if (Array.isArray(requiredKeywords)) patch.requiredKeywords = requiredKeywords;
  if (Array.isArray(bonusKeywords)) patch.bonusKeywords = bonusKeywords;
  if (typeof active === "boolean") patch.active = active;
  if (typeof sortOrder === "number") patch.sortOrder = sortOrder;

  const rows = await db
    .update(topicsTable)
    .set(patch)
    .where(eq(topicsTable.id, id))
    .returning();

  if (!rows[0]) {
    res.status(404).json({ error: "Topic not found" });
    return;
  }

  await recordAudit({
    actor: "admin",
    action: "topic.update",
    entity: "topic",
    entityId: id,
    detail: { ...patch },
  });

  res.json(rows[0]);
});

/**
 * DELETE /admin/topics/:id — remove a topic.
 */
router.delete("/admin/topics/:id", async (req, res) => {
  const id = req.params.id as string;

  const rows = await db
    .delete(topicsTable)
    .where(eq(topicsTable.id, id))
    .returning();

  if (!rows[0]) {
    res.status(404).json({ error: "Topic not found" });
    return;
  }

  await recordAudit({
    actor: "admin",
    action: "topic.delete",
    entity: "topic",
    entityId: id,
    detail: { title: rows[0].title },
  });

  res.json({ deleted: true });
});

export default router;

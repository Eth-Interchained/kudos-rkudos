import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, subscribersTable, blastRunsTable } from "@workspace/db";
import { SubscribeBody } from "@workspace/api-zod";
import { requireAdmin } from "../middleware/adminAuth";
import { recordAudit } from "../services/audit";
import { runWeeklyBlast } from "../services/blast";
import { subscribeEmail } from "../services/subscribers";

const router: IRouter = Router();

/**
 * Public: opt in to the weekly digest. Idempotent — re-subscribing an existing
 * email reactivates it rather than creating a duplicate.
 */
router.post("/subscribers", async (req, res) => {
  const body = SubscribeBody.parse(req.body);
  const outcome = await subscribeEmail(body.email);
  if (!outcome.ok) {
    res.status(400).json({ error: "Provide a valid email address." });
    return;
  }
  res.status(201).json({ ok: true, status: outcome.status });
});

/**
 * Public: one-click unsubscribe from the link in every email. Returns a tiny
 * HTML confirmation so the recipient sees something when they click.
 */
router.get("/subscribers/unsubscribe", async (req, res) => {
  const token = typeof req.query.token === "string" ? req.query.token.trim() : "";
  if (!token) {
    res.status(400).send("<p>Missing unsubscribe token.</p>");
    return;
  }
  const rows = await db
    .update(subscribersTable)
    .set({ status: "unsubscribed", unsubscribedAt: new Date().toISOString() })
    .where(eq(subscribersTable.unsubToken, token))
    .returning();

  if (rows.length === 0) {
    res.status(404).send("<p>Unknown unsubscribe link.</p>");
    return;
  }
  res
    .status(200)
    .send(
      "<p>You have been unsubscribed from the Interchained Social Mining digest.</p>",
    );
});

/**
 * Admin: subscriber list + counts.
 */
router.get("/subscribers", requireAdmin, async (_req, res) => {
  const subs = await db
    .select()
    .from(subscribersTable)
    .orderBy(desc(subscribersTable.createdAt));
  const active = subs.filter((s) => s.status === "active").length;
  res.json({ total: subs.length, active, subscribers: subs });
});

/**
 * Admin: history of weekly blasts (the idempotent-lock ledger).
 */
router.get("/blast-runs", requireAdmin, async (_req, res) => {
  const runs = await db
    .select()
    .from(blastRunsTable)
    .orderBy(desc(blastRunsTable.startedAt))
    .limit(50);
  res.json({ runs });
});

/**
 * Admin: trigger the weekly blast now. Bypasses the blastEnabled switch but the
 * per-week lock still applies, so it cannot double-send within a week.
 */
router.post("/blast/run", requireAdmin, async (req, res) => {
  const result = await runWeeklyBlast({ force: true, log: req.log });
  await recordAudit({
    actor: "admin",
    action: "blast.run",
    entity: "blast",
    detail: result,
  });
  res.json(result);
});

export default router;

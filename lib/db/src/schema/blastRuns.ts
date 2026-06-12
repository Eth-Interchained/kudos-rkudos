import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { randomUUID } from "node:crypto";

/**
 * One row per weekly digest send. `periodKey` is the ISO week (e.g. "2026-W23")
 * and is UNIQUE — this is the idempotent lock: a blast for a given week is an
 * insert-on-conflict-do-nothing, so a second trigger in the same week is a
 * no-op and we never double-email subscribers. Start/stop is the blastEnabled
 * setting; this table guarantees at-most-once-per-week regardless.
 */
export const blastRunsTable = sqliteTable("blast_runs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  periodKey: text("period_key").notNull().unique(),
  // running | sent | failed
  status: text("status").notNull().default("running"),
  recipientCount: integer("recipient_count").notNull().default(0),
  postCount: integer("post_count").notNull().default(0),
  error: text("error"),
  startedAt: text("started_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  completedAt: text("completed_at"),
});

export type BlastRun = typeof blastRunsTable.$inferSelect;
export type InsertBlastRun = typeof blastRunsTable.$inferInsert;

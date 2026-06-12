import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { randomUUID } from "node:crypto";

/**
 * Admin-managed topic pool for auto-mined blocks.
 * Each row is one topic that the scheduler can rotate through. Admins can
 * add/edit/delete/reorder topics and toggle them active/inactive from the
 * console without touching code.
 */
export const topicsTable = sqliteTable("topics", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  title: text("title").notNull(),
  /** The topic prompt fed to AiAS for post generation and reply scoring. */
  topic: text("topic").notNull().default(""),
  /** JSON array of required keywords miners must include. */
  requiredKeywords: text("required_keywords", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .$defaultFn(() => []),
  /** JSON array of bonus keywords that boost a miner's score. */
  bonusKeywords: text("bonus_keywords", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .$defaultFn(() => []),
  /** Sort position — lower numbers come first in rotation. */
  sortOrder: integer("sort_order").notNull().default(0),
  /** Active topics are included in rotation; inactive ones are skipped. */
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString())
    .$onUpdate(() => new Date().toISOString()),
});

export type Topic = typeof topicsTable.$inferSelect;
export type InsertTopic = typeof topicsTable.$inferInsert;

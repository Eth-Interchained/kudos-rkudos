import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { randomUUID } from "node:crypto";

export const abuseEventsTable = sqliteTable("abuse_events", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  participantId: text("participant_id"),
  blockId: text("block_id"),
  replyId: text("reply_id"),
  kind: text("kind").notNull(),
  severity: text("severity").notNull().default("low"),
  detail: text("detail"),
  resolved: text("resolved"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export type AbuseEvent = typeof abuseEventsTable.$inferSelect;
export type InsertAbuseEvent = typeof abuseEventsTable.$inferInsert;

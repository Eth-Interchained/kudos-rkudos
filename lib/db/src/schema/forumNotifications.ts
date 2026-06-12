import { sqliteTable, text, index } from "drizzle-orm/sqlite-core";
import { randomUUID } from "node:crypto";

/**
 * Forum notifications. Rendered as a second tab in the existing Inbox beside
 * encrypted DMs. kind ∈ mention | quote | reply | solved | elevated | payout | mod.
 */
export const forumNotificationsTable = sqliteTable(
  "forum_notifications",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    participantId: text("participant_id").notNull(),
    kind: text("kind").notNull(),
    payload: text("payload", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .$defaultFn(() => ({})),
    readAt: text("read_at"),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => ({
    participantIdx: index("idx_forum_notifications_participant").on(
      t.participantId,
      t.createdAt,
    ),
  }),
);

export type ForumNotification = typeof forumNotificationsTable.$inferSelect;
export type InsertForumNotification =
  typeof forumNotificationsTable.$inferInsert;

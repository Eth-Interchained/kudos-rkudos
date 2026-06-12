import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";

/**
 * Per-participant thread subscription + read tracking. readCount feeds the TL1
 * "≥10 threads read" criterion in services/trustLevels.ts.
 */
export const forumThreadSubscriptionsTable = sqliteTable(
  "forum_thread_subscriptions",
  {
    participantId: text("participant_id").notNull(),
    threadId: text("thread_id").notNull(),
    // watching | tracking | muted
    level: text("level").notNull().default("watching"),
    readCount: integer("read_count").notNull().default(0),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
      .$onUpdate(() => new Date().toISOString()),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.participantId, t.threadId] }),
  }),
);

export type ForumThreadSubscription =
  typeof forumThreadSubscriptionsTable.$inferSelect;
export type InsertForumThreadSubscription =
  typeof forumThreadSubscriptionsTable.$inferInsert;

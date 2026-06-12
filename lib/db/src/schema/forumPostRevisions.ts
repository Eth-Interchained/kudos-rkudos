import { sqliteTable, text, index } from "drizzle-orm/sqlite-core";
import { randomUUID } from "node:crypto";

/** Edit history for a forum post. One row per edit; rawMd is the pre-edit body. */
export const forumPostRevisionsTable = sqliteTable(
  "forum_post_revisions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    postId: text("post_id").notNull(),
    editorParticipantId: text("editor_participant_id").notNull(),
    rawMd: text("raw_md").notNull().default(""),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => ({
    postIdx: index("idx_forum_post_revisions_post").on(t.postId, t.createdAt),
  }),
);

export type ForumPostRevision = typeof forumPostRevisionsTable.$inferSelect;
export type InsertForumPostRevision =
  typeof forumPostRevisionsTable.$inferInsert;

import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { randomUUID } from "node:crypto";

/**
 * A forum thread. Two optional bridges to the mining pipeline:
 *  - blockId  (UNIQUE, nullable): set when the thread materializes a mining
 *    block (Direction 1) or when a community thread is elevated (Direction 2).
 *    A thread with blockId set is (or was) a mining block.
 *  - projectId (UNIQUE, nullable): set when the thread mirrors an approved
 *    project in the Projects category.
 * A thread with neither is free discussion that never touches AiAS or treasury.
 *
 * blockId/projectId uniqueness is enforced by the raw DDL in lib/db/src/index.ts
 * (SQLite UNIQUE columns permit multiple NULLs, which is exactly what we want).
 */
export const forumThreadsTable = sqliteTable(
  "forum_threads",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    categoryId: text("category_id").notNull(),
    authorParticipantId: text("author_participant_id").notNull(),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    blockId: text("block_id").unique(),
    projectId: text("project_id").unique(),
    // open | locked | hidden | pinned
    status: text("status").notNull().default("open"),
    postCount: integer("post_count").notNull().default(0),
    lastPostAt: text("last_post_at"),
    solvedPostId: text("solved_post_id"),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
      .$onUpdate(() => new Date().toISOString()),
  },
  (t) => ({
    categoryLastPostIdx: index("idx_forum_threads_category_lastpost").on(
      t.categoryId,
      t.lastPostAt,
    ),
    authorIdx: index("idx_forum_threads_author").on(t.authorParticipantId),
  }),
);

export type ForumThread = typeof forumThreadsTable.$inferSelect;
export type InsertForumThread = typeof forumThreadsTable.$inferInsert;

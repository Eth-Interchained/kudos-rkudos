import { sqliteTable, text, index } from "drizzle-orm/sqlite-core";
import { randomUUID } from "node:crypto";

/**
 * A forum post.
 *  - miningKeyHash null  => X-mirrored or system OP => read-only on-site.
 *  - replyId (UNIQUE, nullable) is the submission bridge: it points at the
 *    replies row that scored this post. Scores on that reply row are immutable —
 *    editing a post (rawMd) never rescores. Uniqueness => one post per reply.
 *  - contentHash uses the same contentHash() as services/scoring.ts.
 *  - status drives FTS visibility: only 'visible' posts are in forum_posts_fts
 *    (maintained by triggers in lib/db/src/index.ts).
 */
export const forumPostsTable = sqliteTable(
  "forum_posts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    threadId: text("thread_id").notNull(),
    participantId: text("participant_id").notNull(),
    miningKeyHash: text("mining_key_hash"),
    replyToPostId: text("reply_to_post_id"),
    rawMd: text("raw_md").notNull().default(""),
    contentHash: text("content_hash").notNull().default(""),
    replyId: text("reply_id").unique(),
    // visible | hidden_pending_review | hidden | deleted
    status: text("status").notNull().default("visible"),
    editedAt: text("edited_at"),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
      .$onUpdate(() => new Date().toISOString()),
  },
  (t) => ({
    threadIdx: index("idx_forum_posts_thread").on(t.threadId, t.createdAt),
    participantIdx: index("idx_forum_posts_participant").on(
      t.participantId,
      t.createdAt,
    ),
  }),
);

export type ForumPost = typeof forumPostsTable.$inferSelect;
export type InsertForumPost = typeof forumPostsTable.$inferInsert;

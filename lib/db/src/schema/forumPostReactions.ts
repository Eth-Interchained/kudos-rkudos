import { sqliteTable, text, primaryKey } from "drizzle-orm/sqlite-core";

/**
 * Reactions on a forum post. Composite PK (postId, participantId, kind) gives
 * at-most-one reaction of each kind per participant per post. Self-reaction is
 * rejected at the route. kind weights (used by the resonance adapter, PR #4):
 *   kudos 1.0 | insightful 1.5 | solution_assist 2.0
 */
export const forumPostReactionsTable = sqliteTable(
  "forum_post_reactions",
  {
    postId: text("post_id").notNull(),
    participantId: text("participant_id").notNull(),
    kind: text("kind").notNull(),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.postId, t.participantId, t.kind] }),
  }),
);

export type ForumPostReaction = typeof forumPostReactionsTable.$inferSelect;
export type InsertForumPostReaction =
  typeof forumPostReactionsTable.$inferInsert;

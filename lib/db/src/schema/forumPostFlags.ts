import { sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import { randomUUID } from "node:crypto";

/**
 * Community flags on a forum post. One flag per (post, flagger). When an admin
 * resolves a flag as "upheld", the resolver also writes an abuse_events row
 * (kind forum_<reason>) and applies a behaviorScore delta (see
 * services/trustLevels.ts BEHAVIOR_DELTAS) — wired in PR #4.
 */
export const forumPostFlagsTable = sqliteTable(
  "forum_post_flags",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    postId: text("post_id").notNull(),
    flaggerParticipantId: text("flagger_participant_id").notNull(),
    // spam | abuse | off_topic | plagiarism | reward_farming | other
    reason: text("reason").notNull(),
    note: text("note"),
    // null (open) | upheld | rejected
    resolution: text("resolution"),
    resolverHandle: text("resolver_handle"),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    resolvedAt: text("resolved_at"),
  },
  (t) => ({
    uniqPostFlagger: unique().on(t.postId, t.flaggerParticipantId),
  }),
);

export type ForumPostFlag = typeof forumPostFlagsTable.$inferSelect;
export type InsertForumPostFlag = typeof forumPostFlagsTable.$inferInsert;

import { sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import { randomUUID } from "node:crypto";

/**
 * Recent X posts pulled for an approved project (last ~20 at approval time).
 * Admins can turn any of these into a reward block. Deduped per project+post.
 */
export const projectPostsTable = sqliteTable(
  "project_posts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    projectId: text("project_id").notNull(),
    xPostId: text("x_post_id").notNull(),
    xPostUrl: text("x_post_url").notNull(),
    text: text("text").notNull().default(""),
    syncedAt: text("synced_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => ({
    uniqProjectPost: unique().on(t.projectId, t.xPostId),
  }),
);

export type ProjectPost = typeof projectPostsTable.$inferSelect;
export type InsertProjectPost = typeof projectPostsTable.$inferInsert;

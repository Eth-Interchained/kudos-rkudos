import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { randomUUID } from "node:crypto";

export const blocksTable = sqliteTable("blocks", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  seq: integer("seq").notNull().unique(),
  xPostId: text("x_post_id").unique(),
  xPostUrl: text("x_post_url"),
  postContent: text("post_content"),
  xPostedAt: text("x_posted_at"),
  postMode: text("post_mode"),
  title: text("title").notNull(),
  topic: text("topic").notNull().default(""),
  rewardItc: real("reward_itc").notNull().default(0),
  requiredKeywords: text("required_keywords", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .$defaultFn(() => []),
  bonusKeywords: text("bonus_keywords", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .$defaultFn(() => []),
  sponsor: text("sponsor"),
  status: text("status").notNull().default("draft"),
  perAccountCapItc: real("per_account_cap_itc"),
  qualityFloor: integer("quality_floor").notNull().default(60),
  trustFloor: real("trust_floor").notNull().default(0.2),
  opensAt: text("opens_at"),
  closesAt: text("closes_at"),
  settledAt: text("settled_at"),
  /**
   * rKudos bridge: the forum thread materialized from this block (1:1). The
   * runtime UNIQUE constraint is a partial index over non-null values created
   * in lib/db/src/index.ts (SQLite cannot ALTER-ADD a UNIQUE column).
   */
  threadId: text("thread_id").unique(),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString())
    .$onUpdate(() => new Date().toISOString()),
});

export type Block = typeof blocksTable.$inferSelect;
export type InsertBlock = typeof blocksTable.$inferInsert;

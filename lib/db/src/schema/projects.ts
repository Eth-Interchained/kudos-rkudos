import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { randomUUID } from "node:crypto";

/**
 * Partner projects that apply to be featured on the chain. An approved project
 * gets its recent X posts synced (see project_posts) and shows on the public
 * Featured Projects directory; admins still create reward blocks manually,
 * tagging the project as sponsor. Rewards are always paid in ITC.
 */
export const projectsTable = sqliteTable("projects", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  name: text("name").notNull(),
  xHandle: text("x_handle").notNull(),
  xUserId: text("x_user_id"),
  description: text("description").notNull().default(""),
  websiteUrl: text("website_url"),
  // pending | approved | rejected
  status: text("status").notNull().default("pending"),
  rejectionReason: text("rejection_reason"),
  reviewedAt: text("reviewed_at"),
  appliedAt: text("applied_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString())
    .$onUpdate(() => new Date().toISOString()),
});

export type Project = typeof projectsTable.$inferSelect;
export type InsertProject = typeof projectsTable.$inferInsert;

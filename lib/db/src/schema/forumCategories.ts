import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { randomUUID } from "node:crypto";

/**
 * rKudos forum categories. Seeded at boot by forumBridge.ensureForumDefaults():
 * mining (0), archive (locked, 10), projects (15), general (TL1+, 20).
 *
 * minTrustLevel gates who can CREATE threads in the category (a permissions
 * lever only — see services/trustLevels.ts; never a scoring input). A very high
 * value (e.g. 10) makes a category effectively read-only / archival.
 */
export const forumCategoriesTable = sqliteTable("forum_categories", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
  minTrustLevel: integer("min_trust_level").notNull().default(0),
  miningEligible: integer("mining_eligible", { mode: "boolean" })
    .notNull()
    .default(false),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString())
    .$onUpdate(() => new Date().toISOString()),
});

export type ForumCategory = typeof forumCategoriesTable.$inferSelect;
export type InsertForumCategory = typeof forumCategoriesTable.$inferInsert;

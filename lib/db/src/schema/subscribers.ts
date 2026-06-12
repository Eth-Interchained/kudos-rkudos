import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { randomUUID } from "node:crypto";

/**
 * Readers who opt in to the weekly email digest. We store only the email and a
 * per-row unsubscribe token (for one-click opt-out links). Status flips to
 * "unsubscribed" rather than deleting the row, so a re-subscribe is idempotent.
 */
export const subscribersTable = sqliteTable("subscribers", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  email: text("email").notNull().unique(),
  // active | unsubscribed
  status: text("status").notNull().default("active"),
  unsubToken: text("unsub_token")
    .notNull()
    .unique()
    .$defaultFn(() => randomUUID()),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  unsubscribedAt: text("unsubscribed_at"),
});

export type Subscriber = typeof subscribersTable.$inferSelect;
export type InsertSubscriber = typeof subscribersTable.$inferInsert;

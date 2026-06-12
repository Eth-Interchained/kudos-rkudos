import { sqliteTable, text, index } from "drizzle-orm/sqlite-core";
import { randomUUID } from "node:crypto";

export const hashpitMessagesTable = sqliteTable(
  "hashpit_messages",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    /** "block:<blockId>" or "lobby" */
    channel: text("channel").notNull(),
    /** SHA-256 prefix of the sender's mining key — null for system events */
    miningKeyHash: text("mining_key_hash"),
    /** Display handle — "@system" for system events */
    handle: text("handle").notNull(),
    /** "chat" or "system" */
    kind: text("kind").notNull().default("chat"),
    /** Message body, max 280 chars enforced at route level */
    body: text("body").notNull(),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (table) => ({
    channelIdx: index("idx_hashpit_channel").on(table.channel, table.createdAt),
  }),
);

export type HashpitMessage = typeof hashpitMessagesTable.$inferSelect;
export type InsertHashpitMessage = typeof hashpitMessagesTable.$inferInsert;

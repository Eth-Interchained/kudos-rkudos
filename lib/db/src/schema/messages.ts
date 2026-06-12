import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { randomUUID } from "node:crypto";

/**
 * Direct messages between miners.
 * Body is encrypted client-side before sending — the server only stores ciphertext.
 * Auth is via miningKeyHash — only the sender's hash is stored for verification.
 */
export const messagesTable = sqliteTable(
  "messages",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    /** SHA-256 prefix of sender's mining key */
    fromHash: text("from_hash").notNull(),
    /** SHA-256 prefix of recipient's mining key */
    toHash: text("to_hash").notNull(),
    /** Display handle of sender (plaintext for inbox listing) */
    fromHandle: text("from_handle").notNull(),
    /** Display handle of recipient */
    toHandle: text("to_handle").notNull(),
    /** Encrypted message body (encrypted client-side with shared secret) */
    body: text("body").notNull(),
    /** 0 = unread, 1 = read */
    read: integer("read").notNull().default(0),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (table) => ({
    inboxIdx: index("idx_messages_inbox").on(table.toHash, table.createdAt),
    threadIdx: index("idx_messages_thread").on(table.fromHash, table.toHash, table.createdAt),
  }),
);

export type Message = typeof messagesTable.$inferSelect;
export type InsertMessage = typeof messagesTable.$inferInsert;

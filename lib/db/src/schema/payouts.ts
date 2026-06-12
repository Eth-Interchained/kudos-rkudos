import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { randomUUID } from "node:crypto";

export const payoutsTable = sqliteTable("payouts", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  blockId: text("block_id").notNull(),
  replyId: text("reply_id").notNull(),
  participantId: text("participant_id").notNull(),
  itcAddress: text("itc_address"),
  amountItc: real("amount_itc").notNull().default(0),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  status: text("status").notNull().default("pending"),
  batchTxid: text("batch_txid"),
  confirmations: integer("confirmations").notNull().default(0),
  approvedBy: text("approved_by"),
  flagged: integer("flagged", { mode: "boolean" }).notNull().default(false),
  holdReason: text("hold_reason"),
  paidAt: text("paid_at"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString())
    .$onUpdate(() => new Date().toISOString()),
});

export type Payout = typeof payoutsTable.$inferSelect;
export type InsertPayout = typeof payoutsTable.$inferInsert;

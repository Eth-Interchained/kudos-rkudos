import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const settlementsTable = sqliteTable("settlements", {
  blockId: text("block_id").primaryKey(),
  totalHashpower: real("total_hashpower").notNull().default(0),
  validMiners: integer("valid_miners").notNull().default(0),
  totalReplies: integer("total_replies").notNull().default(0),
  rewardItc: real("reward_itc").notNull().default(0),
  merkleRoot: text("merkle_root").notNull().default(""),
  leaves: text("leaves", { mode: "json" })
    .$type<
      Array<{
        handle: string;
        itcAddress: string;
        amountItc: number;
        leafHash: string;
      }>
    >()
    .notNull()
    .$defaultFn(() => []),
  anchorTxid: text("anchor_txid"),
  anchorMode: text("anchor_mode").notNull().default("simulated"),
  computedAt: text("computed_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export type Settlement = typeof settlementsTable.$inferSelect;
export type InsertSettlement = typeof settlementsTable.$inferInsert;

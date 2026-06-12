import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { randomUUID } from "node:crypto";

export const participantsTable = sqliteTable("participants", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  xUserId: text("x_user_id").notNull().unique(),
  xHandle: text("x_handle").notNull(),
  accountCreated: text("account_created"),
  followersCount: integer("followers_count").notNull().default(0),
  verified: integer("verified", { mode: "boolean" }).notNull().default(false),
  trustScore: real("trust_score").notNull().default(0),
  behaviorScore: real("behavior_score").notNull().default(0.5),
  pohTier: integer("poh_tier").notNull().default(0),
  itcAddress: text("itc_address"),
  addressProvedAt: text("address_proved_at"),
  bindNonce: text("bind_nonce"),
  banned: integer("banned", { mode: "boolean" }).notNull().default(false),
  banReason: text("ban_reason"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString())
    .$onUpdate(() => new Date().toISOString()),
});

export type Participant = typeof participantsTable.$inferSelect;
export type InsertParticipant = typeof participantsTable.$inferInsert;

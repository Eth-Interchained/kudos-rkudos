import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const auditLogTable = sqliteTable("audit_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  actor: text("actor"),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  detail: text("detail"),
  ts: text("ts")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export type AuditEntry = typeof auditLogTable.$inferSelect;
export type InsertAuditEntry = typeof auditLogTable.$inferInsert;

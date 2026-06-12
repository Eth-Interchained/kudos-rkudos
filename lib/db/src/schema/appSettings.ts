import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const appSettingsTable = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString())
    .$onUpdate(() => new Date().toISOString()),
});

export type AppSetting = typeof appSettingsTable.$inferSelect;
export type InsertAppSetting = typeof appSettingsTable.$inferInsert;

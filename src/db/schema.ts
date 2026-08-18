import { pgTable, serial, text, integer, numeric, timestamp, varchar } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  telegramUserId: varchar("telegram_user_id", { length: 32 }).notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const receipts = pgTable("receipts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  telegramFileId: text("telegram_file_id").notNull(),
  vendor: text("vendor"),
  purchaseDate: text("purchase_date"),
  currency: varchar("currency", { length: 8 }),
  total: numeric("total", { precision: 12, scale: 2 }),
  totalUsd: numeric("total_usd", { precision: 12, scale: 2 }),
  exchangeRateArsUsd: numeric("exchange_rate_ars_usd", { precision: 12, scale: 4 }),
  status: varchar("status", { length: 16 }).notNull().default("pending"),
  rawExtraction: text("raw_extraction"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

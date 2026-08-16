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
  status: varchar("status", { length: 16 }).notNull().default("pending"),
  rawExtraction: text("raw_extraction"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const receiptItems = pgTable("receipt_items", {
  id: serial("id").primaryKey(),
  receiptId: integer("receipt_id").notNull().references(() => receipts.id),
  name: text("name").notNull(),
  quantity: numeric("quantity", { precision: 10, scale: 2 }),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }),
});

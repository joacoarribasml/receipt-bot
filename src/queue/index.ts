import { Queue, Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import type { Bot } from "grammy";
import { config } from "../config.js";
import { extractReceipt } from "../llm/extractReceipt.js";
import { db } from "../db/client.js";
import { users, receipts, receiptItems } from "../db/schema.js";
import { eq } from "drizzle-orm";

export interface ReceiptJobData {
  telegramUserId: string;
  chatId: number;
  fileId: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
}

const connection = new Redis(config.redisUrl, { maxRetriesPerRequest: null });

export const receiptQueue = new Queue<ReceiptJobData>("receipt-processing", { connection });

async function getOrCreateUser(telegramUserId: string) {
  const existing = await db.select().from(users).where(eq(users.telegramUserId, telegramUserId)).limit(1);
  if (existing[0]) return existing[0];
  const [created] = await db.insert(users).values({ telegramUserId }).returning();
  return created;
}

export function startReceiptWorker(bot: Bot) {
  return new Worker<ReceiptJobData>(
    "receipt-processing",
    async (job: Job<ReceiptJobData>) => {
      const { telegramUserId, chatId, fileId, mediaType } = job.data;

      const file = await bot.api.getFile(fileId);
      const fileUrl = `https://api.telegram.org/file/bot${config.telegramBotToken}/${file.file_path}`;
      const response = await fetch(fileUrl);
      const buffer = Buffer.from(await response.arrayBuffer());
      const imageBase64 = buffer.toString("base64");

      const extraction = await extractReceipt({ imageBase64, mediaType });

      const user = await getOrCreateUser(telegramUserId);
      const [receipt] = await db
        .insert(receipts)
        .values({
          userId: user.id,
          telegramFileId: fileId,
          vendor: extraction.vendor,
          purchaseDate: extraction.purchaseDate,
          currency: extraction.currency,
          total: extraction.total?.toString(),
          status: "processed",
          rawExtraction: JSON.stringify(extraction),
        })
        .returning();

      if (extraction.items.length > 0) {
        await db.insert(receiptItems).values(
          extraction.items.map((item) => ({
            receiptId: receipt.id,
            name: item.name,
            quantity: item.quantity?.toString(),
            unitPrice: item.unitPrice?.toString(),
          })),
        );
      }

      const itemLines = extraction.items.map((i) => `  • ${i.name} — ${i.unitPrice ?? "?"}`).join("\n");
      const lowConfidenceNote = extraction.confidence !== "high" ? `\n⚠️ confidence: ${extraction.confidence}` : "";
      await bot.api.sendMessage(
        chatId,
        `✅ Saved receipt #${receipt.id}\n` +
          `Vendor: ${extraction.vendor ?? "unknown"}\n` +
          `Date: ${extraction.purchaseDate ?? "unknown"}\n` +
          `Total: ${extraction.total ?? "?"} ${extraction.currency ?? ""}\n` +
          (itemLines ? `Items:\n${itemLines}` : "") +
          lowConfidenceNote,
      );
    },
    { connection },
  );
}

import { Queue, Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import type { Bot } from "grammy";
import { config } from "../config.js";
import { extractReceipt } from "../llm/extractReceipt.js";
import { isNothingFound } from "../llm/isNothingFound.js";
import { getBlueRate, convertArsToUsd } from "../fx/dolarBlue.js";
import { db } from "../db/client.js";
import { users, receipts } from "../db/schema.js";
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

async function toUsd(total: number | null, currency: string | null): Promise<{ totalUsd: number | null; rate: number | null }> {
  if (total === null) return { totalUsd: null, rate: null };
  if (currency?.toUpperCase() === "USD") return { totalUsd: total, rate: 1 };
  if (currency?.toUpperCase() !== "ARS") return { totalUsd: null, rate: null };

  const blueRate = await getBlueRate();
  if (!blueRate) return { totalUsd: null, rate: null };
  return { totalUsd: convertArsToUsd(total, blueRate), rate: blueRate.venta };
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

      if (isNothingFound(extraction)) {
        await bot.api.sendMessage(chatId, "Couldn't find a receipt in that photo. Try a clearer picture?");
        return;
      }

      const { totalUsd, rate } = await toUsd(extraction.total, extraction.currency);

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
          totalUsd: totalUsd?.toString(),
          exchangeRateArsUsd: rate?.toString(),
          status: "processed",
          rawExtraction: JSON.stringify(extraction),
        })
        .returning();

      const usdLine = totalUsd !== null ? `\n≈ USD ${totalUsd.toFixed(2)} (blue rate ${rate})` : "";
      const lowConfidenceNote = extraction.confidence !== "high" ? `\n⚠️ confidence: ${extraction.confidence}` : "";
      await bot.api.sendMessage(
        chatId,
        `✅ Saved receipt #${receipt.id}\n` +
          `Vendor: ${extraction.vendor ?? "unknown"}\n` +
          `Date: ${extraction.purchaseDate ?? "unknown"}\n` +
          `Total: ${extraction.total ?? "?"} ${extraction.currency ?? ""}` +
          usdLine +
          lowConfidenceNote,
      );
    },
    { connection },
  );
}

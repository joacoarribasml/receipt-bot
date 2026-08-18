import { Bot } from "grammy";
import { config } from "../config.js";
import { receiptQueue } from "../queue/index.js";
import { db } from "../db/client.js";
import { users, receipts } from "../db/schema.js";
import { eq, desc, sql } from "drizzle-orm";
import { isAllowedUser } from "./accessControl.js";
import { logger } from "../logger.js";

export function createBot() {
  const bot = new Bot(config.telegramBotToken);

  bot.use(async (ctx, next) => {
    const userId = ctx.from?.id?.toString();
    if (!isAllowedUser(userId, config.allowedTelegramUserIds)) {
      await ctx.reply("This bot is private.");
      return;
    }
    await next();
  });

  bot.command("start", (ctx) =>
    ctx.reply("Send me a photo of a receipt and I'll parse it. Try /history or /summary once you've sent a few."),
  );

  bot.command("history", async (ctx) => {
    const userId = ctx.from!.id.toString();
    const [user] = await db.select().from(users).where(eq(users.telegramUserId, userId)).limit(1);
    if (!user) return ctx.reply("No receipts yet.");

    const rows = await db
      .select()
      .from(receipts)
      .where(eq(receipts.userId, user.id))
      .orderBy(desc(receipts.createdAt))
      .limit(10);

    if (rows.length === 0) return ctx.reply("No receipts yet.");
    const lines = rows.map((r) => {
      const usd = r.totalUsd !== null ? ` (≈USD ${r.totalUsd})` : "";
      return `#${r.id} — ${r.vendor ?? "unknown"} — ${r.total ?? "?"} ${r.currency ?? ""}${usd} (${r.purchaseDate ?? "n/a"})`;
    });
    await ctx.reply(lines.join("\n"));
  });

  bot.command("summary", async (ctx) => {
    const userId = ctx.from!.id.toString();
    const [user] = await db.select().from(users).where(eq(users.telegramUserId, userId)).limit(1);
    if (!user) return ctx.reply("No receipts yet.");

    const [row] = await db
      .select({
        totalUsd: sql<string>`coalesce(sum(${receipts.totalUsd}), 0)`,
        count: sql<number>`count(*)`,
      })
      .from(receipts)
      .where(eq(receipts.userId, user.id));

    await ctx.reply(`${row.count} receipts logged, ≈USD ${row.totalUsd} total (blue rate).`);
  });

  bot.on("message:photo", async (ctx) => {
    const userId = ctx.from.id.toString();
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    logger.info({ userId, chatId: ctx.chat.id }, "Received receipt photo");
    logger.debug({ userId, fileId: photo.file_id }, "Receipt photo file id");
    await ctx.reply("Processing receipt…");
    await receiptQueue.add(
      "process-receipt",
      {
        telegramUserId: userId,
        chatId: ctx.chat.id,
        fileId: photo.file_id,
        mediaType: "image/jpeg",
      },
      { attempts: 3, backoff: { type: "exponential", delay: 2000 } },
    );
  });

  return bot;
}

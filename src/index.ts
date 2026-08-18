import http from "node:http";
import { webhookCallback } from "grammy";
import { createBot } from "./bot/index.js";
import { startReceiptWorker } from "./queue/index.js";
import { logger, serializeError } from "./logger.js";
import { config } from "./config.js";

const bot = createBot();
const worker = startReceiptWorker(bot);

worker.on("failed", async (job, err) => {
  logger.error({ jobId: job?.id, attemptsMade: job?.attemptsMade, err: serializeError(err) }, "Receipt job attempt failed");

  const attemptsExhausted = job && job.attemptsMade >= (job.opts.attempts ?? 1);
  if (attemptsExhausted && job.data.chatId) {
    try {
      await bot.api.sendMessage(job.data.chatId, "Sorry, something went wrong processing that receipt. Please try again.");
    } catch (notifyErr) {
      logger.error({ notifyErr: serializeError(notifyErr) }, "Failed to notify user of job failure");
    }
  }
});

if (config.webhookUrl) {
  const handleUpdate = webhookCallback(bot, "http");
  const server = http.createServer(async (req, res) => {
    if (req.method === "POST" && req.url === "/telegram-webhook") {
      if (req.headers["x-telegram-bot-api-secret-token"] !== config.webhookSecret) {
        res.writeHead(401);
        res.end("unauthorized");
        return;
      }
      try {
        await handleUpdate(req, res);
      } catch (err) {
        logger.error({ err: serializeError(err) }, "Failed to handle webhook update");
        if (!res.headersSent) {
          res.writeHead(200);
          res.end("ok");
        }
      }
    } else {
      res.writeHead(200);
      res.end("ok");
    }
  });

  await bot.api.setWebhook(`${config.webhookUrl}/telegram-webhook`, { secret_token: config.webhookSecret! });
  server.listen(config.port, () => logger.info({ port: config.port }, "Webhook server listening"));
} else {
  bot.start({
    onStart: () => logger.info("Bot polling started"),
  });
}

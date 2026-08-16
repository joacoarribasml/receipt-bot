import { createBot } from "./bot/index.js";
import { startReceiptWorker } from "./queue/index.js";

const bot = createBot();
const worker = startReceiptWorker(bot);

worker.on("failed", (job, err) => {
  console.error(`Job ${job?.id} failed:`, err);
});

bot.start({
  onStart: () => console.log("Bot polling started"),
});

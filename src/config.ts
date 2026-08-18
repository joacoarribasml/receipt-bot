import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const config = {
  telegramBotToken: required("TELEGRAM_BOT_TOKEN"),
  anthropicApiKey: required("ANTHROPIC_API_KEY"),
  allowedTelegramUserIds: new Set(
    required("ALLOWED_TELEGRAM_USER_IDS")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  ),
  databaseUrl: required("DATABASE_URL"),
  redisUrl: required("REDIS_URL"),
  // Unset locally (polling mode). Set in production to the app's public HTTPS origin
  // to switch to webhook mode, which lets the host scale the machine to zero when idle.
  webhookUrl: process.env.WEBHOOK_URL || null,
  // Required alongside webhookUrl — verifies incoming webhook POSTs actually came from
  // Telegram (which echoes it back in a header) rather than an arbitrary request to the URL.
  webhookSecret: process.env.WEBHOOK_SECRET || null,
  port: Number(process.env.PORT ?? 8080),
};

if (config.webhookUrl && !config.webhookSecret) {
  throw new Error("WEBHOOK_SECRET is required when WEBHOOK_URL is set");
}

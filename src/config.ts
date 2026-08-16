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
};

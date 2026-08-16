# receipt-bot

A Telegram bot that parses photos of receipts into structured data using Claude's
vision + tool-use, queues the work through Redis/BullMQ, and stores history in Postgres.

## Architecture

```
Telegram photo
      │
      ▼
grammY bot (polling/webhook) ── access control (allow-listed user IDs)
      │  enqueue job
      ▼
BullMQ queue (Redis)
      │
      ▼
Worker
  ├─ fetch image via Telegram file API
  ├─ Claude vision call, forced tool-use → structured JSON
  ├─ zod validation (one retry on schema mismatch)
  ├─ insert into Postgres (receipts, receipt_items)
  └─ reply to user with parsed summary
```

Commands: `/start`, `/history` (last 10 receipts), `/summary` (running total).

### Design choices

- **Forced tool-use instead of free-text parsing.** The model must call a
  `record_receipt` tool with a fixed JSON schema, which is far more reliable than
  asking it to "return JSON" in prose.
- **One retry on schema validation failure.** If the model's output doesn't match the
  zod schema, we send it back with the validation error and ask it to correct itself
  once before giving up.
- **Confidence field.** The model self-reports `high`/`medium`/`low` confidence, which
  the bot surfaces so bad extractions (blurry photos, handwriting) are visibly flagged
  rather than silently wrong.
- **A queue, not a direct call.** Decouples "user sent a photo" from "LLM finished
  processing it" — the bot ack's immediately and the worker can be scaled or retried
  independently.

## Stack

TypeScript, grammY, Anthropic SDK, BullMQ + Redis, Postgres + Drizzle ORM, Docker.

## Local development

```bash
cp .env.example .env   # fill in TELEGRAM_BOT_TOKEN, ANTHROPIC_API_KEY, ALLOWED_TELEGRAM_USER_IDS
docker compose up -d   # Postgres + Redis
npm install
npm run db:migrate
npm run dev
```

Message your bot on Telegram with a photo of a receipt.

## Evaluation

```bash
npm run eval
```

Runs extraction against a labeled fixture set in `eval/fixtures/` and reports
field-level accuracy and latency. See `eval/fixtures/README.md` for how to add cases.

## Deployment

Dockerized (`Dockerfile`); deployed to Fly.io/Render with the bot switched from
polling to webhook mode. Postgres and Redis are managed add-ons in production.

# receipt-bot

A Telegram bot that parses photos of receipts into structured data using Claude's
vision + tool-use, queues the work through Redis/BullMQ, and stores history in Postgres.

Personal, single-user project (access is allow-listed to one Telegram account) — built to
explore structured extraction, eval-driven iteration, and a few production patterns.

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
  ├─ Claude vision call, forced tool-use → structured JSON (vendor, date, currency, total)
  ├─ zod validation (one retry on schema mismatch)
  ├─ if currency is ARS: fetch blue-dollar rate (dolarapi.com) → convert to USD
  ├─ insert into Postgres (receipts)
  └─ reply to user with parsed summary
```

Commands: `/start`, `/history` (last 10 receipts), `/summary` (running total).

### Design choices

- **Forced tool-use instead of free-text parsing** — the model calls a `record_receipt`
  tool against a fixed JSON schema rather than being asked to "return JSON" in prose.
- **One retry on schema validation failure**, with the validation error fed back to the
  model before giving up.
- **Model self-reports confidence** (`high`/`medium`/`low`), surfaced to the user so bad
  extractions are flagged rather than silently wrong.
- **A queue, not a direct call** — decouples "photo received" from "LLM finished," so the
  bot acks immediately and processing can be retried independently (BullMQ, 3 attempts
  with exponential backoff).
- **ARS→USD conversion is hard-coded logic, not an LLM tool call** — deterministic
  arithmetic against a cached live rate (`dolarapi.com`), stored per receipt so historical
  totals don't drift as the rate moves, and fails gracefully (null, not a broken job) if
  the rate fetch is down.
- **"Nothing found" is a distinct outcome from "saved with unknown fields"** — a photo
  that isn't a receipt gets a clear "couldn't find a receipt" reply and no DB write,
  instead of a junk row with every field null.
- **Errors are always logged as `message`/`name`/`stack`, never the raw error object** —
  some error types carry live objects with secrets attached (grammY's `BotError` embeds
  the API client, token included).

## Stack

TypeScript, grammY, Anthropic SDK, BullMQ + Redis, Postgres + Drizzle ORM, pino
(structured logging), Docker, Fly.io.

## Local development

```bash
cp .env.example .env   # fill in TELEGRAM_BOT_TOKEN, ANTHROPIC_API_KEY, ALLOWED_TELEGRAM_USER_IDS
docker compose up -d   # Postgres + Redis
npm install
npm run db:migrate
npm run dev
```

## Testing

```bash
npm test
```

18 unit tests (vitest, in CI on every push): schema validation, the extraction
retry-on-invalid-output path (mocked Anthropic client), FX conversion math, access
control, and "nothing found" detection. No live API calls.

## Evaluation

```bash
npm run eval
```

Runs real extraction calls against 10 labeled receipts in `eval/fixtures/` and reports
field-level accuracy and latency — a separate, manual step from `npm test`, a few cents a
run. It's already caught two real bugs: a scoring false-negative from apostrophe character
variants, and a genuine model weak point on faint digits in dates. See
`eval/fixtures/README.md` for how to add cases.

## Deployment

Dockerized and deployed to Fly.io for live verification — webhook mode (Telegram pushes
instead of the app polling), secret-token-verified webhook endpoint, DB migrations run
automatically via `release_command`, single machine scaling to zero when idle. Torn down
between sessions since this isn't meant to run continuously.

To redeploy: `fly launch` (or reuse `fly.toml`), attach Postgres and Redis, `fly secrets
set` the six values from `.env` (`WEBHOOK_SECRET` via `openssl rand -hex 32`), `fly deploy
--ha=false` (`--ha` defaults to `true` on `fly deploy` itself and will create a second
machine otherwise).

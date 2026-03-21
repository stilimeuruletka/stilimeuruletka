# Telegram Lottery System

Монорепозиторий высоконагруженной лотереи: Telegram-бот + WebApp (Next.js) + Supabase (Postgres).

## Структура

- [frontend](file:///Users/annavolkova/Desktop/лотерея%20стильная/frontend) — Telegram WebApp на Next.js
- [backend](file:///Users/annavolkova/Desktop/лотерея%20стильная/backend) — REST API + Telegram webhook
- [database](file:///Users/annavolkova/Desktop/лотерея%20стильная/database) — SQL миграции для Supabase

## Быстрый старт (локально)

1) Установить зависимости:

```bash
npm install
```

2) Применить миграцию в Supabase:

- Откройте Supabase → SQL Editor → вставьте содержимое [001_init.sql](file:///Users/annavolkova/Desktop/лотерея%20стильная/database/migrations/001_init.sql) → Run.

3) Настроить переменные окружения для backend:

Переменные (backend):
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `TELEGRAM_BOT_USERNAME`
- `TELEGRAM_CHANNEL_ID`
- `PUBLIC_WEBAPP_URL`
- `PORT` (опционально)

4) Настроить переменные окружения для frontend:

Переменные (frontend):
- `NEXT_PUBLIC_BACKEND_URL` (например `http://localhost:3001`)

5) Запустить backend и frontend:

```bash
npm -w backend run dev
npm -w frontend run dev
```

## Настройка Telegram webhook

Backend ожидает POST обновления от Telegram на:
- `POST /telegram/webhook`

Webhook защищён заголовком `X-Telegram-Bot-Api-Secret-Token`, который Telegram отправляет при использовании `secret_token`.

Пример установки webhook:

```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -d "url=https://<your-domain>/telegram/webhook" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

## API и авторизация

### REST API (для WebApp)

WebApp аутентифицируется через Telegram WebApp `initData`, который передаётся заголовком:
- `x-telegram-init-data: <initData>`

Endpoints:
- `GET /health`
- `GET /api/me` → `{ tg_user_id, balance }`
- `POST /api/spin` → результат вращения (списывает 1 билет)
- `GET /api/referral/link` → реферальная ссылка на бота

### Telegram webhook (для бота)

Telegram шлёт обновления в:
- `POST /telegram/webhook`

## Логирование и аудит

- Backend логирует запросы и ошибки в stdout (pino).
- Пользовательские действия пишутся в таблицу `audit_events` (старт, проверки подписки, вращения, баланс).

## Безопасность

- Rate limiting на уровне API (Fastify rate-limit)
- HTTP security headers (helmet)
- Проверка подписи Telegram WebApp initData на backend
- Защита webhook секретом `X-Telegram-Bot-Api-Secret-Token`
- Критические операции билетов/спинов реализованы транзакционно в Postgres функциях (RPC)

## Тесты

```bash
npm run test
```

```bash
npm run lint
npm run typecheck
```


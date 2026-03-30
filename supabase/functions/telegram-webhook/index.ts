// @ts-nocheck
// Telegram webhook as Supabase Edge Function
// Обрабатывает /start и отправляет первое сообщение с кнопкой "СТИЛЬНАЯ РУЛЕТКА"

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const TELEGRAM_WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") ?? "";
const PUBLIC_WEBAPP_URL = Deno.env.get("PUBLIC_WEBAPP_URL") ?? "";

if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_WEBHOOK_SECRET || !PUBLIC_WEBAPP_URL) {
  console.error("Missing required environment variables for telegram-webhook function");
}

type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number };
    from: { id: number; username?: string };
    text?: string;
  };
};

async function sendTelegramMessage(chatId: number, text: string) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const body = {
    chat_id: chatId,
    text,
    reply_markup: {
      inline_keyboard: [[{ text: "СТИЛЬНАЯ РУЛЕТКА", web_app: { url: PUBLIC_WEBAPP_URL } }]]
    }
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error("Failed to send Telegram message", res.status, errText);
  }
}

serve(async (req) => {
  try {
    const secret = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
    if (!secret || secret !== TELEGRAM_WEBHOOK_SECRET) {
      return new Response(JSON.stringify({ ok: false, error: "invalid secret" }), {
        status: 401,
        headers: { "content-type": "application/json" }
      });
    }

    const update = (await req.json().catch(() => ({}))) as TelegramUpdate;

    const msg = update.message;
    const text = msg?.text ?? "";
    if (msg && text.startsWith("/start")) {
      const chatId = msg.chat.id;

      // Здесь позже можно добавить вызов RPC handle_start в Supabase,
      // сейчас только приветствие и кнопка.
      const line = "Приглашайте друзей и получайте дополнительные билеты для прокрутов в игре.";

      await sendTelegramMessage(chatId, line);
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  } catch (e) {
    console.error("telegram-webhook edge function error", e);
    return new Response(JSON.stringify({ ok: false }), {
      status: 500,
      headers: { "content-type": "application/json" }
    });
  }
});

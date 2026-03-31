import { NextRequest, NextResponse } from "next/server";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const PUBLIC_WEBAPP_URL = process.env.PUBLIC_WEBAPP_URL ?? "https://stilimeuruletka.vercel.app";

type TelegramUser = {
  id: number;
  username?: string;
};

type TelegramChat = {
  id: number;
};

type TelegramMessage = {
  message_id: number;
  chat: TelegramChat;
  from: TelegramUser;
  text?: string;
};

type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
};

async function sendStartMessage(chatId: number) {
  if (!TELEGRAM_BOT_TOKEN) {
    console.error("TELEGRAM_BOT_TOKEN is not set");
    return;
  }

  const text =
    "Приглашайте друзей и получайте дополнительные билеты для прокрутов в игре.";

  const body = {
    chat_id: chatId,
    text,
    reply_markup: {
      inline_keyboard: [[{ text: "СТИЛЬНАЯ РУЛЕТКА", web_app: { url: PUBLIC_WEBAPP_URL } }]]
    }
  };

  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    console.error("Failed to send Telegram start message", res.status, errorText);
  }
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-telegram-bot-api-secret-token") ?? "";

  if (!TELEGRAM_WEBHOOK_SECRET || secret !== TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = (await req.json()) as TelegramUpdate;
  } catch (e) {
    console.error("Invalid Telegram webhook body", e);
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const message = update.message;
  const text = message?.text ?? "";

  if (message && text.startsWith("/start")) {
    const chatId = message.chat.id;
    await sendStartMessage(chatId);
  }

  return NextResponse.json({ ok: true });
}


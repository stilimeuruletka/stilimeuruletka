import { NextRequest, NextResponse } from "next/server";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const DEFAULT_WEBAPP_URL = "https://stilimeuruletka.vercel.app";

function getSafeWebAppUrl(input: string | undefined) {
  if (!input) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }

  if (url.protocol !== "https:") {
    return null;
  }

  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local")) {
    return null;
  }

  const isIpv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
  if (isIpv4) {
    const [a, b] = host.split(".").map((p) => Number(p));
    const isPrivate =
      a === 10 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a === 127;
    if (isPrivate) {
      return null;
    }
  }

  url.hash = "";
  url.search = "";
  return url.origin;
}

const PUBLIC_WEBAPP_URL = getSafeWebAppUrl(process.env.PUBLIC_WEBAPP_URL) ?? DEFAULT_WEBAPP_URL;

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

async function sendTelegramRequest(method: string, body: unknown) {
  if (!TELEGRAM_BOT_TOKEN) {
    console.error("TELEGRAM_BOT_TOKEN is not set");
    return;
  }

  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    console.error(`Failed to send Telegram ${method}`, res.status, errorText);
  }
}

async function sendStartMessage(chatId: number) {
  const text = `Добро пожаловать в Стильную Рулетку ! Место, где стиль встречается с удачей и становится частью вашей истории. 

— Что это такое? 
Пространство, где объединяются самые модные и красивые: читатели, бренды, инфлюенсеры. Каждый день — новая возможность заполучить ценные призы. 

Стильная Рулетка  — цифровой  формат розыгрышей с ежедневной механикой: вы вращаете колесо и получаете один из возможных исходов — от подарков до специальных предложений от брендов и создателя приложения @stilimeu 

— Что нужно делать? 
Крутите виртуальное колесо удачи ежедневно, черпайте вдохновение и радуйтесь выигрышу. И, конечно, не забывайте приглашать друзей! Каждый присоединившийся по вашей ссылке друг — дополнительный шанс на победу. 

— Как начать? 
Проще простого! Нажмите /start и испытайте фортуну прямо сейчас! 

И помните: удача — это тоже стиль!`;

  const base = PUBLIC_WEBAPP_URL.replace(/\/+$/, "");

  await sendTelegramRequest("sendMediaGroup", {
    chat_id: chatId,
    media: [
      { type: "photo", media: `${base}/${encodeURIComponent("IMG_3162.JPEG")}`, caption: text },
      { type: "photo", media: `${base}/${encodeURIComponent("IMG_3178.JPEG")}` }
    ]
  });

  await sendTelegramRequest("sendMessage", {
    chat_id: chatId,
    text: "⠀",
    reply_markup: {
      inline_keyboard: [[{ text: "СТИЛЬНАЯ РУЛЕТКА", web_app: { url: PUBLIC_WEBAPP_URL } }]]
    }
  });
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

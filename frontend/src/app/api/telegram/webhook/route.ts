import { NextRequest } from "next/server";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET!;
const CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID!;
const PUBLIC_WEBAPP_URL = process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/+$/, "") || process.env.PUBLIC_WEBAPP_URL || "";

const rateMap = new Map<number, number>();

type TgPayload = Record<string, unknown>;

type TgApiResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
};

async function tg<T>(method: string, body: TgPayload): Promise<TgApiResponse<T>> {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const json = (await res.json().catch(() => null)) as TgApiResponse<T> | null;
  return json ?? { ok: false, description: "Invalid Telegram response" };
}

type ChannelId = number | string;

const channelResolveCache = new Map<string, number>();

function normalizeChannelId(raw: string): ChannelId {
  let v = raw.trim();
  v = v.replace(/^https?:\/\/t\.me\//, "").replace(/^t\.me\//, "");
  v = (v.split("?")[0]?.split("#")[0] ?? v).replace(/\/+$/, "");
  if (/^-?\d+$/.test(v)) return Number(v);
  v = v.startsWith("@") ? v.slice(1) : v;
  if (!v) return "@stilimeuruletka";
  return `@${v}`;
}

async function resolveChannelId(channelId: ChannelId): Promise<number | null> {
  if (typeof channelId === "number") return channelId;
  const cached = channelResolveCache.get(channelId);
  if (cached !== undefined) return cached;

  const res = await tg<{ id: number }>("getChat", { chat_id: channelId });
  if (!res.ok || typeof res.result?.id !== "number") {
    console.warn("telegram_getChat_failed", { channelId, error_code: res.error_code, description: res.description });
    return null;
  }

  channelResolveCache.set(channelId, res.result.id);
  return res.result.id;
}

async function sendWelcome(chatId: number | string) {
  const text =
    "Приветствую, стилевые! Готовы позволить себе щепотку элегантной эстетики?\n\nПроверьте подписку на наше сообщество, мы начинаем! 💔";
  const base = (PUBLIC_WEBAPP_URL || "https://stilimeuruletka.vercel.app").replace(/\/+$/, "");
  await tg("sendMediaGroup", {
    chat_id: chatId,
    media: [
      { type: "photo", media: `${base}/IMG_3162.JPEG`, caption: text },
      { type: "photo", media: `${base}/IMG_3178.JPEG` }
    ]
  });
  await tg("sendMessage", {
    chat_id: chatId,
    text: "⠀",
    reply_markup: {
      inline_keyboard: [
        [{ text: "СТИЛЬНАЯ РУЛЕТКА | СООБЩЕСТВО", url: "https://t.me/stilimeuruletka" }],
        [{ text: "Проверить подписку", callback_data: "check_sub" }]
      ]
    }
  });
}

async function sendSubscribedMenu(chatId: number | string) {
  const base = (PUBLIC_WEBAPP_URL || "https://stilimeuruletka.vercel.app").replace(/\/+$/, "");
  await tg("sendPhoto", {
    chat_id: chatId,
    photo: `${base}/пример.jpg`,
    reply_markup: {
      inline_keyboard: [
        [{ text: "РАЗДАТЬ СТИЛЯ | ЗАПУСТИТЬ ПРИЛОЖЕНИЕ TG", web_app: { url: base } }],
        [
          { text: "Стильная поддержка", url: "https://t.me/stilimeuruletkasos" },
          { text: "Канал сообщества", url: "https://t.me/stilimeuruletka" }
        ],
        [
          { text: "Список призов", url: "https://t.me/stilimeuruletka/6" },
          { text: "Как играть", web_app: { url: `${base}/main/how-to-play` } }
        ]
      ]
    }
  });
}

async function checkSubscription(userId: number) {
  const normalized = normalizeChannelId(CHANNEL_ID);
  const tryCheck = async (chatId: ChannelId) =>
    tg<{ status: string; is_member?: boolean }>("getChatMember", { chat_id: chatId, user_id: userId });

  let res = await tryCheck(normalized);
  if (!res.ok) {
    const desc = res.description ?? "";
    const isChatNotFound = desc.toLowerCase().includes("chat not found");
    if (isChatNotFound || desc.toLowerCase().includes("bad request")) {
      const resolved = await resolveChannelId(normalized);
      if (resolved !== null) {
        res = await tryCheck(resolved);
      }
    }
  }

  if (!res.ok) {
    console.warn("telegram_getChatMember_failed", {
      userId,
      channelId: CHANNEL_ID,
      normalizedChannelId: normalized,
      error_code: res.error_code,
      description: res.description
    });
    return false;
  }

  const status = res.result?.status;
  const isMemberFlag = res.result?.is_member;
  const ok =
    status === "member" ||
    status === "administrator" ||
    status === "creator" ||
    (status === "restricted" && isMemberFlag === true);

  console.info("telegram_getChatMember", { userId, channelId: CHANNEL_ID, status, is_member: isMemberFlag, ok });
  return ok;
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-telegram-bot-api-secret-token");
  if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) {
    return new Response(JSON.stringify({ ok: false }), { status: 401 });
  }
  let update: unknown;
  try {
    update = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false }), { status: 400 });
  }

  const u = update as { message?: { text?: string; chat: { id: number }; from: { id: number } }; callback_query?: { id: string; data?: string; from: { id: number }; message?: { chat?: { id: number } } } };

  if (u?.message?.text) {
    const chatId = u.message.chat.id;
    const userId = u.message.from.id;
    const text: string = u.message.text;
    if (text.startsWith("/start")) {
      await sendWelcome(chatId);
    } else if (text === "/check_sub") {
      const last = rateMap.get(userId);
      const now = Date.now();
      if (last && now - last < 2000) {
        await tg("sendMessage", { chat_id: chatId, text: "Подождите 2 секунды и попробуйте ещё раз." });
      } else {
        rateMap.set(userId, now);
        const ok = await checkSubscription(userId);
        if (!ok) {
          await tg("sendMessage", {
            chat_id: chatId,
            text: "Face control не пройден…💔\n\nПроверьте подписку на наше сообщество и попробуйте нажать на кнопку ещё раз.",
            reply_markup: {
              inline_keyboard: [
                [{ text: "СТИЛЬНАЯ РУЛЕТКА | СООБЩЕСТВО", url: "https://t.me/stilimeuruletka" }],
                [{ text: "Проверить подписку", callback_data: "check_sub" }]
              ]
            }
          });
        } else {
          await sendSubscribedMenu(chatId);
        }
      }
    }
  }

  if (u?.callback_query?.data) {
    const chatId = u.callback_query.message?.chat?.id ?? u.callback_query.from.id;
    const userId = u.callback_query.from.id;
    const data: string = u.callback_query.data;
    await tg("answerCallbackQuery", { callback_query_id: u.callback_query.id });
    if (data === "check_sub") {
      const last = rateMap.get(userId);
      const now = Date.now();
      if (last && now - last < 2000) {
        await tg("sendMessage", { chat_id: chatId, text: "Подождите 2 секунды и попробуйте ещё раз." });
      } else {
        rateMap.set(userId, now);
        const ok = await checkSubscription(userId);
        if (!ok) {
          await tg("sendMessage", {
            chat_id: chatId,
            text: "Face control не пройден…💔\n\nПроверьте подписку на наше сообщество и попробуйте нажать на кнопку ещё раз.",
            reply_markup: {
              inline_keyboard: [
                [{ text: "СТИЛЬНАЯ РУЛЕТКА | СООБЩЕСТВО", url: "https://t.me/stilimeuruletka" }],
                [{ text: "Проверить подписку", callback_data: "check_sub" }]
              ]
            }
          });
        } else {
          await sendSubscribedMenu(chatId);
        }
      }
    } else if (data === "balance") {
      await tg("sendMessage", { chat_id: chatId, text: "Баланс: 0 билет(ов)." });
    }
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}

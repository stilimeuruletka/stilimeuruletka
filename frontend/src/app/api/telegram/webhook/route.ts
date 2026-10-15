import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

function getAdminSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function parseStartPayload(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/start")) return null;
  const payload = trimmed.split(/\s+/, 2)[1];
  return payload && payload.length > 0 ? payload : null;
}

function extractRefCodeFromPayload(payload: string | null): string | null {
  if (!payload) return null;
  const v = payload.trim();
  if (!v) return null;
  if (v.startsWith("ref_")) return v.slice(4) || null;
  return null;
}

async function handleStartFromBot(tgUserId: number, username: string | null, payload: string | null) {
  const supabase = getAdminSupabase();
  if (!supabase) return null;
  const refCode = extractRefCodeFromPayload(payload);
  const { data, error } = await supabase.rpc("handle_start", {
    p_tg_user_id: tgUserId,
    p_username: username,
    p_ref_code: refCode
  });
  if (error) {
    console.error("telegram_webhook_handle_start_failed", error);
    return null;
  }
  return data ?? null;
}

async function getTelegramUserBalance(tgUserId: number) {
  const supabase = getAdminSupabase();
  if (!supabase) return 0;

  const { data: user, error: userError } = await supabase
    .from("users")
    .select("id")
    .eq("tg_user_id", tgUserId)
    .maybeSingle();

  if (userError || !user?.id) {
    if (userError) console.error("telegram_webhook_balance_user_failed", userError);
    return 0;
  }

  const { data: rows, error: balanceError } = await supabase
    .from("ticket_ledger")
    .select("delta")
    .eq("user_id", user.id);

  if (balanceError) {
    console.error("telegram_webhook_balance_ledger_failed", balanceError);
    return 0;
  }

  return Array.isArray(rows)
    ? rows.reduce((sum, row) => sum + Number((row as { delta?: number }).delta || 0), 0)
    : 0;
}

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
  await tg("sendPhoto", {
    chat_id: chatId,
    photo: `${base}/IMG_3162.JPEG`,
    caption: text,
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
    photo: `${base}/IMG_3178.JPEG`,
    reply_markup: {
      inline_keyboard: [
        [{ text: "ЗАПУСТИТЬ ПРИЛОЖЕНИЕ | РАЗДАТЬ СТИЛЯ", web_app: { url: base } }],
        [
          { text: "Поддержка", url: "https://t.me/stilimeuruletkasos" },
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
  const provided = typeof secret === "string" ? secret : "";
  const expected = WEBHOOK_SECRET ?? "";
  if (!expected || provided !== expected) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  let update: unknown;
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const u = update as {
    message?: { text?: string; chat: { id: number }; from: { id: number; username?: string } };
    callback_query?: { id: string; data?: string; from: { id: number; username?: string }; message?: { chat?: { id: number } } };
  };

  if (u?.message?.text) {
    const chatId = u.message.chat.id;
    const userId = u.message.from.id;
    const username = typeof u.message.from.username === "string" && u.message.from.username.length > 0 ? u.message.from.username : null;
    const text: string = u.message.text;
    if (text.startsWith("/start")) {
      const payload = parseStartPayload(text);
      await handleStartFromBot(userId, username, payload);
      await sendWelcome(chatId);
    } else if (text === "/balance") {
      const balance = await getTelegramUserBalance(userId);
      await tg("sendMessage", { chat_id: chatId, text: `Баланс: ${balance} билет(ов).` });
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
      const balance = await getTelegramUserBalance(userId);
      await tg("sendMessage", { chat_id: chatId, text: `Баланс: ${balance} билет(ов).` });
    }
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}

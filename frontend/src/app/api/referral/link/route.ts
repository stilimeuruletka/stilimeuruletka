import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { extractTelegramInitData, verifyTelegramInitData } from "../../../../lib/telegramWebApp";

export const runtime = "nodejs";

function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

function getAdminSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("SUPABASE_URL is not configured");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: NextRequest) {
  try {
    const initDataHeader = req.headers.get("x-telegram-init-data") ?? "";
    if (!initDataHeader) return jsonError("Откройте приложение через Telegram", 401);

    const botToken = process.env.TELEGRAM_BOT_TOKEN ?? "";
    if (!botToken) return jsonError("Server is not configured", 500);
    if (!verifyTelegramInitData(initDataHeader, botToken)) return jsonError("Invalid Telegram data", 401);

    const extracted = extractTelegramInitData(initDataHeader);
    if (!extracted) return jsonError("Invalid Telegram data", 401);

    const startParamHeaderRaw = (req.headers.get("x-tg-start-param") ?? "").trim();
    const startParamHeader =
      /^(ref|blog)_[a-z0-9_]{1,80}$/i.test(startParamHeaderRaw) ? startParamHeaderRaw : null;
    const startParam = extracted.startParam || startParamHeader;

    const supabase = getAdminSupabase();
    const { error: startError } = await supabase.rpc("handle_start", {
      p_tg_user_id: extracted.userId,
      p_username: extracted.username,
      p_ref_code: startParam?.startsWith("ref_") ? startParam.slice(4) : startParam,
      p_photo_url: extracted.photoUrl
    });
    if (startError) {
      console.error("[api/referral/link] handle_start failed", startError);
      return jsonError("Не удалось создать пользователя", 500);
    }

    const { data, error } = await supabase
      .from("users")
      .select("referral_code")
      .eq("tg_user_id", extracted.userId)
      .maybeSingle();

    if (error) {
      console.error("[api/referral/link] referral_code query failed", error);
      return jsonError("Не удалось получить ссылку", 500);
    }

    const refCode = data?.referral_code;
    if (!refCode) return jsonError("Не удалось получить ссылку", 500);

    const botUsername =
      process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ||
      process.env.TELEGRAM_BOT_USERNAME ||
      "";
    const cleanBotUsername = botUsername.replace(/^@/, "");

    if (!cleanBotUsername) {
      return jsonError("Bot username is not configured", 500);
    }

    return NextResponse.json({
      link: `https://t.me/${cleanBotUsername}?start=ref_${refCode}`
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("[api/referral/link] unhandled error", message, e);
    return jsonError("Не удалось получить ссылку", 500);
  }
}

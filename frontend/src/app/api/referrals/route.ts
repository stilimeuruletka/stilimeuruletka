import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { extractTelegramInitData, verifyTelegramInitData } from "../../../lib/telegramWebApp";

export const runtime = "nodejs";

function getAdminSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("SUPABASE_URL is not configured");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  return createClient(url, key, { auth: { persistSession: false } });
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
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

    const supabase = getAdminSupabase();
    const { data: rows, error } = await supabase.rpc("list_referrals", { p_tg_user_id: extracted.userId });
    if (error) {
      console.error("[api/referrals] list_referrals failed", error);
      return jsonError("Не удалось загрузить друзей", 500);
    }

    const friends = Array.isArray(rows) ? rows : [];
    return NextResponse.json({ count: friends.length, friends });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("[api/referrals] unhandled error", message, e);
    return jsonError("Не удалось загрузить друзей", 500);
  }
}


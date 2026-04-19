import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { extractTelegramInitData, verifyTelegramInitData } from "../../../../lib/telegramWebApp";

export const runtime = "nodejs";

function getAdminSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("SUPABASE_URL is not configured");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  return createClient(url, key, { auth: { persistSession: false } });
}

function jsonError(message: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ message, ...(extra ?? {}) }, { status });
}

export async function GET(req: NextRequest) {
  const initDataHeader = req.headers.get("x-telegram-init-data") ?? "";
  if (!initDataHeader) {
    return jsonError("Откройте приложение через Telegram", 401);
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN ?? "";
  if (!botToken) {
    return jsonError("Server is not configured", 500);
  }

  if (!verifyTelegramInitData(initDataHeader, botToken)) {
    return jsonError("Invalid Telegram data", 401);
  }

  const extracted = extractTelegramInitData(initDataHeader);
  if (!extracted) {
    return jsonError("Invalid Telegram data", 401);
  }

  const limitRaw = req.nextUrl.searchParams.get("limit");
  const limit = limitRaw ? Math.max(1, Math.min(200, Math.trunc(Number(limitRaw)))) : 50;

  const supabase = getAdminSupabase();

  const { data: rows, error } = await supabase.rpc("get_spin_history", { p_tg_user_id: extracted.userId, p_limit: limit });
  if (error) {
    return jsonError("Не удалось загрузить историю", 500, { error: error.message });
  }

  return NextResponse.json({ spins: rows ?? [] });
}


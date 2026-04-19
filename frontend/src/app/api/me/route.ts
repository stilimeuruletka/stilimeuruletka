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

function jsonError(message: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ message, ...(extra ?? {}) }, { status });
}

export async function GET(req: NextRequest) {
  try {
    const initDataHeader = req.headers.get("x-telegram-init-data") ?? "";
    if (!initDataHeader) return jsonError("Откройте приложение через Telegram", 401);

    const botToken = process.env.TELEGRAM_BOT_TOKEN ?? "";
    if (!botToken) return jsonError("TELEGRAM_BOT_TOKEN is not configured", 500);
    if (!verifyTelegramInitData(initDataHeader, botToken)) return jsonError("Invalid Telegram data", 401);

    const extracted = extractTelegramInitData(initDataHeader);
    if (!extracted) return jsonError("Invalid Telegram data", 401);

    const tzOffsetRaw = req.nextUrl.searchParams.get("tz_offset");
    const tzOffset = tzOffsetRaw != null ? Number(tzOffsetRaw) : Number.NaN;
    const tzOffsetMinutes = Number.isFinite(tzOffset) ? Math.trunc(tzOffset) : null;

    const supabase = getAdminSupabase();

    const { error: startError } = await supabase.rpc("handle_start", {
      p_tg_user_id: extracted.userId,
      p_username: extracted.username,
      p_ref_code: extracted.startParam
    });
    if (startError) {
      return jsonError("Не удалось создать пользователя", 500, { error: startError.message });
    }

    if (tzOffsetMinutes != null) {
      try {
        await supabase.rpc("set_user_tz_offset", {
          p_tg_user_id: extracted.userId,
          p_tz_offset_minutes: tzOffsetMinutes
        });
      } catch {}
    }

    const { data, error } = await supabase.rpc("ensure_free_spin", { p_tg_user_id: extracted.userId });
    if (error) return jsonError("Не удалось загрузить статус", 500, { error: error.message });

    const balance = (data as { balance?: number } | null)?.balance ?? 0;
    const canSpin = !!(data as { can_spin?: boolean } | null)?.can_spin;
    const nextSpinAt = (data as { next_spin_at?: string | null } | null)?.next_spin_at ?? null;

    return NextResponse.json({ balance, can_spin: canSpin, next_spin_at: nextSpinAt });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonError("Не удалось загрузить статус", 500, { error: message });
  }
}


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

function getMaxWinsPerMonth() {
  const raw = process.env.MAX_WINS_PER_MONTH;
  if (!raw) return null;
  const v = Number(raw);
  if (!Number.isFinite(v)) return null;
  const int = Math.trunc(v);
  return int > 0 ? int : null;
}

function getTestMode() {
  const raw = process.env.SPIN_TEST_MODE;
  if (!raw) return process.env.NODE_ENV !== "production";
  return raw === "1" || raw.toLowerCase() === "true";
}

function jsonError(message: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ message, ...(extra ?? {}) }, { status });
}

export async function POST(req: NextRequest) {
  try {
    const initDataHeader = req.headers.get("x-telegram-init-data") ?? "";
    if (!initDataHeader) {
      return jsonError("Откройте приложение через Telegram", 401);
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN ?? "";
    if (!botToken) {
      return jsonError("TELEGRAM_BOT_TOKEN is not configured", 500);
    }

    if (!verifyTelegramInitData(initDataHeader, botToken)) {
      return jsonError("Invalid Telegram data", 401);
    }

    const extracted = extractTelegramInitData(initDataHeader);
    if (!extracted) {
      return jsonError("Invalid Telegram data", 401);
    }

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

    const { data: cooldown, error: cooldownError } = await supabase.rpc("ensure_free_spin", { p_tg_user_id: extracted.userId });
    if (cooldownError) {
      return jsonError("Спин недоступен", 500, { error: cooldownError.message });
    }

    const canSpin = !!(cooldown as { can_spin?: boolean } | null)?.can_spin;
    const nextSpinAt = (cooldown as { next_spin_at?: string | null } | null)?.next_spin_at ?? null;
    const balance = (cooldown as { balance?: number } | null)?.balance ?? null;

    if (!canSpin) {
      return jsonError("Спин недоступен", 429, { next_spin_at: nextSpinAt, balance });
    }

    const { data: spin, error: spinError } = await supabase.rpc("spin_wheel_limited", {
      p_tg_user_id: extracted.userId,
      p_max_wins_per_month: getMaxWinsPerMonth(),
      p_test_mode: getTestMode(),
      p_segments_count: 10
    });
    if (spinError) {
      const msg = /Not enough tickets/i.test(spinError.message) ? "Спин недоступен" : spinError.message;
      return jsonError(msg, 400, { error: spinError.message });
    }

    let nextData: unknown = null;
    try {
      const res = await supabase.rpc("set_next_spin_after_spin_midnight", { p_tg_user_id: extracted.userId });
      nextData = res.data;
    } catch {
      nextData = null;
    }
    const nextSpinIso = (nextData as { next_spin_at?: string } | null)?.next_spin_at;

    return NextResponse.json({ ...(spin as Record<string, unknown>), next_spin_at: nextSpinIso ?? nextSpinAt ?? null });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    const publicMessage = /not configured/i.test(message) ? message : "Спин недоступен";
    return jsonError(publicMessage, 500, { error: message });
  }
}

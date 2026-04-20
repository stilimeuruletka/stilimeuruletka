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

async function repairDailyTicketIfMissing(supabase: ReturnType<typeof getAdminSupabase>, tgUserId: number) {
  const { data: user, error: userError } = await supabase.from("users").select("id").eq("tg_user_id", tgUserId).single();
  if (userError) return { repaired: false, error: userError.message };

  const { data: lastGrant } = await supabase
    .from("ticket_ledger")
    .select("created_at")
    .eq("user_id", user.id)
    .eq("reason", "daily_free_spin")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const lastMs = lastGrant?.created_at ? Date.parse(lastGrant.created_at as unknown as string) : Number.NaN;
  const recent = Number.isFinite(lastMs) && Date.now() - lastMs < 20 * 60 * 60 * 1000;
  if (recent) return { repaired: false, error: null };

  const { error: insertError } = await supabase.from("ticket_ledger").insert({
    user_id: user.id,
    delta: 1,
    reason: "daily_free_spin",
    meta: { kind: "repair", granted_at: new Date().toISOString() }
  });
  if (insertError) return { repaired: false, error: insertError.message };

  return { repaired: true, error: null };
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
      return jsonError("Откройте приложение через нашего Telegram-бота", 401, { code: "INITDATA_INVALID" });
    }

    const extracted = extractTelegramInitData(initDataHeader);
    if (!extracted) {
      return jsonError("Откройте приложение через нашего Telegram-бота", 401, { code: "INITDATA_PARSE_FAILED" });
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
      return jsonError("Ошибка кулдауна: " + cooldownError.message, 500, { code: "ENSURE_FREE_SPIN_FAILED", error: cooldownError.message });
    }

    const canSpin = !!(cooldown as { can_spin?: boolean } | null)?.can_spin;
    const nextSpinAt = (cooldown as { next_spin_at?: string | null } | null)?.next_spin_at ?? null;
    const balance = (cooldown as { balance?: number } | null)?.balance ?? null;

    if (!canSpin) {
      return jsonError("Спин пока недоступен (подождите)", 429, { code: "COOLDOWN_ACTIVE", next_spin_at: nextSpinAt, balance });
    }

    if ((balance ?? 0) <= 0) {
      const repair = await repairDailyTicketIfMissing(supabase, extracted.userId);
      if (repair.error) {
        return jsonError("Ошибка выдачи билета: " + repair.error, 500, { code: "REPAIR_TICKET_FAILED", error: repair.error });
      }
      if (!repair.repaired) {
        let fallback = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        try {
          const res = await supabase.rpc("set_next_spin_after_spin_midnight", { p_tg_user_id: extracted.userId });
          fallback = (res.data as { next_spin_at?: string } | null)?.next_spin_at ?? fallback;
        } catch {}
        return jsonError("Билет уже был использован недавно", 429, { code: "COOLDOWN_ACTIVE_REPAIRED", next_spin_at: fallback, balance: 0 });
      }
    }

    const { data: spin, error: spinError } = await supabase.rpc("spin_wheel_limited", {
      p_tg_user_id: extracted.userId,
      p_max_wins_per_month: getMaxWinsPerMonth(),
      p_test_mode: getTestMode(),
      p_segments_count: 10
    });
    if (spinError) {
      if (/Not enough tickets/i.test(spinError.message)) {
        return jsonError("Недостаточно билетов", 400, { code: "NO_TICKETS", error: spinError.message });
      }
      return jsonError("Ошибка БД: " + spinError.message, 400, { code: "SPIN_FAILED", error: spinError.message });
    }

    let nextData: unknown = null;
    try {
      const res = await supabase.rpc("set_next_spin_after_spin_midnight", { p_tg_user_id: extracted.userId });
      nextData = res.data;
    } catch {
      nextData = null;
    }
    const nextSpinIso = (nextData as { next_spin_at?: string } | null)?.next_spin_at;
    let nextSpinFinal = nextSpinIso ?? nextSpinAt ?? null;

    if (!nextSpinFinal) {
      const fallback = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      try {
        const res = await supabase.rpc("set_next_spin_after_spin", { p_tg_user_id: extracted.userId, p_next_spin_at: fallback });
        const setIso = (res.data as { next_spin_at?: string } | null)?.next_spin_at;
        nextSpinFinal = setIso ?? fallback;
      } catch {
        nextSpinFinal = fallback;
      }
    }

    return NextResponse.json({ ...(spin as Record<string, unknown>), next_spin_at: nextSpinFinal });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    const publicMessage = /not configured/i.test(message) ? message : "Спин недоступен";
    return jsonError(publicMessage, 500, { code: "UNHANDLED", error: message });
  }
}

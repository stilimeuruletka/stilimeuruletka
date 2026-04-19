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

    const limitRaw = req.nextUrl.searchParams.get("limit");
    const limit = limitRaw ? Math.max(1, Math.min(30, Math.trunc(Number(limitRaw)))) : 9;

    const supabase = getAdminSupabase();

    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id")
      .eq("tg_user_id", extracted.userId)
      .single();
    if (userError) return jsonError("User not found", 404, { error: userError.message });

    const { data: spins, error: spinsError } = await supabase
      .from("spins")
      .select("id,created_at,prize:prizes(title,value)")
      .eq("user_id", user.id)
      .eq("win", true)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (spinsError) return jsonError("Failed to load wins", 500, { error: spinsError.message });

    const wins =
      (spins ?? [])
        .map((row) => {
          const prize = (row as unknown as { prize?: { title?: string | null; value?: number | null } | null }).prize;
          return {
            spin_id: (row as unknown as { id: string }).id,
            created_at: (row as unknown as { created_at: string }).created_at,
            prize_title: prize?.title ?? null,
            prize_value: prize?.value ?? null
          };
        })
        .filter((x) => typeof x.spin_id === "string" && typeof x.created_at === "string") ?? [];

    return NextResponse.json({ wins });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonError("Не удалось загрузить выигрыши", 500, { error: message });
  }
}


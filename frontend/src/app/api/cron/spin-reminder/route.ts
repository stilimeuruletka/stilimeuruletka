import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

async function sendTelegramMessage(botToken: string, chatId: number, text: string, webAppUrl: string) {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      reply_markup: {
        inline_keyboard: [[{ text: "РАЗДАТЬ СТИЛЯ | ЗАПУСТИТЬ ПРИЛОЖЕНИЕ TG", web_app: { url: webAppUrl } }]]
      }
    })
  });

  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    throw new Error(`Telegram sendMessage failed: ${res.status} ${raw}`);
  }
}

async function handle(req: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET ?? "";
    if (!cronSecret) {
      console.error("[cron/spin-reminder] CRON_SECRET is not configured");
      return jsonError("Service is not configured", 500);
    }

    const headerSecret = req.headers.get("x-cron-secret");
    const authHeader = req.headers.get("authorization");
    const bearerSecret = authHeader?.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : null;
    const provided = bearerSecret ?? headerSecret ?? null;
    if (!provided || provided !== cronSecret) return jsonError("Unauthorized", 401);

    const botToken = process.env.TELEGRAM_BOT_TOKEN ?? "";
    if (!botToken) {
      console.error("[cron/spin-reminder] TELEGRAM_BOT_TOKEN is not configured");
      return jsonError("Service is not configured", 500);
    }

    const supabase = getAdminSupabase();
    const nowIso = new Date().toISOString();

    const { data: due, error: dueError } = await supabase.rpc("list_due_spin_users", { p_now: nowIso });
    if (dueError) {
      console.error("[cron/spin-reminder] list_due_spin_users failed", dueError);
      return jsonError("Failed to list due users", 500);
    }

    const users = Array.isArray(due) ? due : [];
    let processed = 0;
    let notified = 0;

    const webAppUrl =
      process.env.PUBLIC_WEBAPP_URL?.replace(/\/+$/, "") ||
      process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/+$/, "") ||
      req.nextUrl.origin;

    for (const row of users) {
      const tgUserId = (row as { tg_user_id?: number | null }).tg_user_id;
      if (typeof tgUserId !== "number" || !Number.isFinite(tgUserId)) continue;
      processed += 1;

      const { data: state, error: stateError } = await supabase.rpc("ensure_free_spin", { p_tg_user_id: tgUserId });
      if (stateError) {
        console.warn("[cron/spin-reminder] ensure_free_spin failed for user", tgUserId, stateError);
        continue;
      }
      const granted = !!(state as { granted?: boolean } | null)?.granted;
      if (!granted) continue;

      try {
        await sendTelegramMessage(
          botToken,
          tgUserId,
          "It’s time to spin & win!\n\nЕжедневный бесплатный спин снова доступен! Ловите +1 на баланс! Переходите в Стильную Рулетку , чтобы испытать удачу.",
          webAppUrl
        );
        notified += 1;
      } catch (e) {
        console.warn("[cron/spin-reminder] Telegram send failed", tgUserId, e instanceof Error ? e.message : e);
      }
    }

    return NextResponse.json({ ok: true, processed, notified });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("[cron/spin-reminder] unhandled error", message, e);
    return jsonError("Cron failed", 500);
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}

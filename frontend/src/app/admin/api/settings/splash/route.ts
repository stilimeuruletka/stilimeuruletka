import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { verifyAdminSession } from "../../../../../lib/adminSession";

export const runtime = "nodejs";

const SETTINGS_KEY = "splash_video_url";

function parseAdminCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const [k, v] = part.split("=");
    if (!k) continue;
    if (k.trim() === "admin_session") return typeof v === "string" ? decodeURIComponent(v.trim()) : null;
  }
  return null;
}

async function requireAdmin(req: Request) {
  const token = parseAdminCookie(req.headers.get("cookie"));
  const session = await verifyAdminSession(token);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return null;
}

function getAdminSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("SUPABASE_URL is not configured");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function getSettingValue(supabase: ReturnType<typeof getAdminSupabase>, key: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error || !data) return null;
  return (data as { value: string }).value ?? null;
}

const PUBLIC_BUCKET_PATH = (name: string) => `splash/${name}`;

function storagePublicUrl(name: string): string {
  const base = process.env.SUPABASE_URL?.replace(/\/+$/, "") ?? "";
  return `${base}/storage/v1/object/public/${PUBLIC_BUCKET_PATH(name)}`;
}

export async function GET(req: Request) {
  const fail = await requireAdmin(req);
  if (fail) return fail;

  const supabase = getAdminSupabase();
  const url = await getSettingValue(supabase, SETTINGS_KEY);
  return NextResponse.json({
    splash_video_url: url ?? "/IMG_2304.MP4"
  });
}

export async function POST(req: Request) {
  const fail = await requireAdmin(req);
  if (fail) return fail;

  const supabase = getAdminSupabase();

  // Режим "сбросить на стандартное видео": без файла, просто сброс на значение по умолчанию
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await req.json().catch(() => null)) as { reset?: boolean } | null;
    if (body?.reset) {
      await supabase.from("app_settings").upsert(
        { key: SETTINGS_KEY, value: "/IMG_2304.MP4", updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );
      return NextResponse.json({ splash_video_url: "/IMG_2304.MP4" });
    }
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json({ error: "Expected multipart/form-data or JSON" }, { status: 400 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid form data" }, { status: 400 });

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Файл не прикреплён" }, { status: 400 });
  }

  if (file.type !== "video/mp4" && !file.name.toLowerCase().endsWith(".mp4")) {
    return NextResponse.json({ error: "Разрешён только MP4" }, { status: 400 });
  }
  if (file.size <= 0 || file.size > 100 * 1024 * 1024) {
    return NextResponse.json({ error: "Размер видео должен быть до 100 МБ" }, { status: 400 });
  }

  const safeName = `splash_${Date.now()}.mp4`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from("splash")
    .upload(safeName, buffer, {
      contentType: "video/mp4",
      upsert: false
    });

  if (uploadError) {
    return NextResponse.json({ error: `Не удалось загрузить файл: ${uploadError.message}` }, { status: 500 });
  }

  const publicUrl = storagePublicUrl(safeName);

  const { error: saveError } = await supabase.from("app_settings").upsert(
    { key: SETTINGS_KEY, value: publicUrl, updated_at: new Date().toISOString() },
    { onConflict: "key" }
  );

  if (saveError) {
    return NextResponse.json({ error: `Не удалось сохранить настройку: ${saveError.message}` }, { status: 500 });
  }

  return NextResponse.json({ splash_video_url: publicUrl });
}
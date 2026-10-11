import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { verifyAdminSession } from "../../../../../lib/adminSession";

export const runtime = "nodejs";

function parseAdminCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [k, v] = part.split("=");
    if (k && k.trim() === "admin_session") return typeof v === "string" ? decodeURIComponent(v.trim()) : null;
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

function storagePublicUrl(name: string): string {
  const base = process.env.SUPABASE_URL?.replace(/\/+$/, "") ?? "";
  return `${base}/storage/v1/object/public/ads/${name}`;
}

export async function GET(req: Request) {
  const fail = await requireAdmin(req);
  if (fail) return fail;

  const supabase = getAdminSupabase();
  const { data, error } = await supabase.rpc("preview_ads_stats");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: own, error: ownError } = await supabase.rpc("preview_own_views");
  if (ownError) return NextResponse.json({ error: ownError.message }, { status: 500 });

  return NextResponse.json({ ads: data ?? [], own_views: own ?? 0 });
}

export async function POST(req: Request) {
  const fail = await requireAdmin(req);
  if (fail) return fail;

  const supabase = getAdminSupabase();
  const contentType = req.headers.get("content-type") ?? "";
  const json = contentType.includes("application/json");

  let clientName = "";
  let publishDate = "";
  let endDate = "";
  let active = true;
  let videoUrl: string | null = null;

  if (json) {
    const body = ((await req.json().catch(() => null)) as Record<string, unknown>) ?? {};
    clientName = typeof body.client_name === "string" ? body.client_name.trim() : "";
    publishDate = typeof body.publish_date === "string" ? body.publish_date : "";
    endDate = typeof body.end_date === "string" ? body.end_date : "";
    active = body.active !== false;
    videoUrl = typeof body.video_url === "string" && body.video_url.trim() ? body.video_url.trim() : null;
  } else if (contentType.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    if (!form) return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
    clientName = String(form.get("client_name") ?? "").trim();
    publishDate = String(form.get("publish_date") ?? "");
    endDate = String(form.get("end_date") ?? "");
    active = String(form.get("active") ?? "true") !== "false";
    const file = form.get("file");
    if (file instanceof File) {
      const isMp4 = file.type === "video/mp4" || file.name.toLowerCase().endsWith(".mp4");
      if (!isMp4) return NextResponse.json({ error: "Разрешён только MP4" }, { status: 400 });
      if (file.size <= 0 || file.size > 100 * 1024 * 1024) {
        return NextResponse.json({ error: "Размер видео должен быть до 100 МБ" }, { status: 400 });
      }
      const safeName = `ads_${Date.now()}.mp4`;
      const buffer = Buffer.from(await file.arrayBuffer());
      const { error: upErr } = await supabase.storage
        .from("splash")
        .upload(safeName, buffer, { contentType: "video/mp4", upsert: false });
      if (upErr) return NextResponse.json({ error: `Не удалось загрузить ролик: ${upErr.message}` }, { status: 500 });
      videoUrl = storagePublicUrl(safeName);
    }
  } else {
    return NextResponse.json({ error: "Expected multipart/form-data or JSON" }, { status: 400 });
  }

  if (!clientName) return NextResponse.json({ error: "client_name обязателен" }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(publishDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return NextResponse.json({ error: "Даты публикации и окончания обязательны (YYYY-MM-DD)" }, { status: 400 });
  }
  if (!videoUrl) return NextResponse.json({ error: "video_url обязателен" }, { status: 400 });

  const { data, error } = await supabase
    .from("preview_ads")
    .insert({ client_name: clientName, publish_date: publishDate, end_date: endDate, active, video_url: videoUrl })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, ad: data });
}
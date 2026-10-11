import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { verifyAdminSession } from "../../../../../../lib/adminSession";

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

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const fail = await requireAdmin(req);
  if (fail) return fail;
  const { id } = await ctx.params;

  const body = ((await req.json().catch(() => null)) as Record<string, unknown>) ?? {};

  const patch: Record<string, unknown> = {};
  if (typeof body.client_name === "string") patch.client_name = body.client_name.trim();
  if (typeof body.publish_date === "string") patch.publish_date = body.publish_date;
  if (typeof body.end_date === "string") patch.end_date = body.end_date;
  if (typeof body.active === "boolean") patch.active = body.active;
  if (typeof body.video_url === "string" && body.video_url.trim()) patch.video_url = body.video_url.trim();

  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Нет полей для обновления" }, { status: 400 });

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("preview_ads")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, ad: data });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const fail = await requireAdmin(req);
  if (fail) return fail;
  const { id } = await ctx.params;

  const supabase = getAdminSupabase();
  const { error } = await supabase
    .from("preview_ads")
    .delete()
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
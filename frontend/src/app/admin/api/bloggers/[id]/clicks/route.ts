import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { verifyAdminSession } from "../../../../../../lib/adminSession";

export const runtime = "nodejs";

function getAdminSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("SUPABASE_URL is not configured");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  return createClient(url, key, { auth: { persistSession: false } });
}

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

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const fail = await requireAdmin(req);
  if (fail) return fail;

  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const supabase = getAdminSupabase();

  const { data: clicks, error } = await supabase
    .from("blogger_clicks")
    .select("tg_user_id, created_at, meta")
    .eq("blogger_id", id)
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const clicksList = (clicks ?? []) as {
    tg_user_id: number | null;
    created_at: string;
    meta: unknown;
  }[];

  const tgIds = clicksList
    .map((c) => c.tg_user_id)
    .filter((v): v is number => typeof v === "number");

  const usersMap = new Map<number, { username: string | null; photo_url: string | null }>();
  if (tgIds.length > 0) {
    const { data: users } = await supabase
      .from("users")
      .select("tg_user_id, username, photo_url")
      .in("tg_user_id", tgIds);
    for (const u of users ?? []) {
      usersMap.set(u.tg_user_id, { username: u.username ?? null, photo_url: u.photo_url ?? null });
    }
  }

  const items = clicksList.map((c) => {
    const u = c.tg_user_id != null ? usersMap.get(c.tg_user_id) : null;
    return {
      tg_user_id: c.tg_user_id,
      username: u?.username ?? null,
      photo_url: u?.photo_url ?? null,
      created_at: c.created_at,
      meta: (c.meta ?? {}) as Record<string, unknown>
    };
  });

  return NextResponse.json({ clicks: items });
}
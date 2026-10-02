import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { verifyAdminSession } from "../../../../lib/adminSession";

export const runtime = "nodejs";

type Blogger = {
  id: string;
  code: string;
  name: string;
  telegram_link: string | null;
  active: boolean;
  created_at: string;
};

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

function normalizeBloggerCode(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const code = v.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
  if (code.length < 2 || code.length > 64) return null;
  return code;
}

function normalizeBloggerName(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const name = v.trim();
  if (name.length < 1 || name.length > 120) return null;
  return name;
}

function normalizeTelegramLink(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (s.length === 0) return null;
  if (s.length > 256) return null;
  return s;
}

export async function GET(req: Request): Promise<NextResponse> {
  const fail = await requireAdmin(req);
  if (fail) return fail;

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("bloggers")
    .select("id,code,name,telegram_link,active,created_at")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ bloggers: (data as Blogger[] | null) ?? [] });
}

export async function POST(req: Request): Promise<NextResponse> {
  const fail = await requireAdmin(req);
  if (fail) return fail;

  const body = (await req.json().catch(() => null)) as unknown;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const obj = body as Record<string, unknown>;

  const code = normalizeBloggerCode(obj.code);
  const name = normalizeBloggerName(obj.name);
  const telegramLink = normalizeTelegramLink(obj.telegram_link);
  if (!code || !name) {
    return NextResponse.json(
      { error: "Invalid blogger data: code 2-64 a-z 0-9 _ -, name 1-120" },
      { status: 400 }
    );
  }

  const activeRaw = obj.active;
  const active = typeof activeRaw === "boolean" ? activeRaw : activeRaw === undefined ? true : Boolean(activeRaw);

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("bloggers")
    .insert({ code, name, telegram_link: telegramLink, active })
    .select("id,code,name,telegram_link,active,created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ blogger: data as Blogger }, { status: 201 });
}

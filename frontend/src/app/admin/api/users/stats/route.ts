import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { verifyAdminSession } from "../../../../../lib/adminSession";

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

function parseMaybeIso(input: string | null) {
  if (!input) return null;
  const ms = Date.parse(input);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

export async function GET(req: Request) {
  const fail = await requireAdmin(req);
  if (fail) return fail;

  const url = new URL(req.url);
  const from = parseMaybeIso(url.searchParams.get("from"));
  const to = parseMaybeIso(url.searchParams.get("to"));

  const supabase = getAdminSupabase();
  const { data, error } = await supabase.rpc("admin_get_user_spin_stats", { p_from: from, p_to: to });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ stats: data ?? [] });
}

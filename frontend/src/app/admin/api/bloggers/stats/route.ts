import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getAdminSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("SUPABASE_URL is not configured");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  return createClient(url, key, { auth: { persistSession: false } });
}

function parseMaybeIso(input: string | null) {
  if (!input) return null;
  const ms = Date.parse(input);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const from = parseMaybeIso(url.searchParams.get("from"));
  const to = parseMaybeIso(url.searchParams.get("to"));

  const supabase = getAdminSupabase();
  const { data, error } = await supabase.rpc("get_blogger_stats", { p_from: from, p_to: to });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ stats: data ?? [] });
}


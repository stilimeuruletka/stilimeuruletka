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

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function normalizeBloggerName(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const name = v.trim();
  if (name.length < 1 || name.length > 120) return null;
  return name;
}

function normalizeBloggerPatch(input: unknown) {
  if (!input || typeof input !== "object") return null;
  const obj = input as Record<string, unknown>;
  const patch: Record<string, unknown> = {};

  if (obj.name !== undefined) {
    const name = normalizeBloggerName(obj.name);
    if (!name) return null;
    patch.name = name;
  }

  if (obj.active !== undefined) {
    if (typeof obj.active !== "boolean") return null;
    patch.active = obj.active;
  }

  if (Object.keys(patch).length === 0) return null;
  return patch;
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const fail = await requireAdmin(req);
  if (fail) return fail;

  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = (await req.json().catch(() => null)) as unknown;
  const patch = normalizeBloggerPatch(body);
  if (!patch) return NextResponse.json({ error: "Invalid blogger data" }, { status: 400 });

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("bloggers")
    .update(patch)
    .eq("id", id)
    .select("id,code,name,active,created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ blogger: data });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const fail = await requireAdmin(req);
  if (fail) return fail;

  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const ok = (req.headers.get("x-confirm") || "").toLowerCase() === "yes";
  if (!ok) return NextResponse.json({ error: "Missing x-confirm: yes header" }, { status: 400 });

  const supabase = getAdminSupabase();
  const { error } = await supabase.from("bloggers").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

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

function normalizeChannelId(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (s.length < 3 || s.length > 64) return null;
  return s;
}

function normalizeTelegramLink(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (s.length === 0) return null;
  if (s.length > 256) return undefined;
  return s;
}

function normalizeGoal(v: unknown): number | undefined {
  if (v === undefined) return undefined;
  if (typeof v === "number" && Number.isFinite(v) && v >= 1 && v <= 1_000_000) return Math.floor(v);
  if (typeof v !== "string") return undefined;
  const n = parseInt(v.trim(), 10);
  if (!Number.isFinite(n) || n < 1 || n > 1_000_000) return undefined;
  return n;
}

function normalizeDate(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (s.length === 0) return null;
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return undefined;
  return d.toISOString();
}

function normalizePatch(input: unknown) {
  if (!input || typeof input !== "object") return null;
  const obj = input as Record<string, unknown>;
  const patch: Record<string, unknown> = {};

  if (obj.blogger_id !== undefined) {
    if (typeof obj.blogger_id !== "string" || !isUuid(obj.blogger_id)) return null;
    patch.blogger_id = obj.blogger_id;
  }
  if (obj.channel_id !== undefined) {
    const v = normalizeChannelId(obj.channel_id);
    if (!v) return null;
    patch.channel_id = v;
  }
  if (obj.telegram_link !== undefined) {
    const v = normalizeTelegramLink(obj.telegram_link);
    if (v === undefined) return null;
    patch.telegram_link = v;
  }
  if (obj.goal_subscribers !== undefined || obj.goal !== undefined) {
    const v = normalizeGoal(obj.goal_subscribers ?? obj.goal);
    if (v === undefined) return null;
    patch.goal_subscribers = v;
  }
  if (obj.starts_at !== undefined || obj.starts !== undefined) {
    const v = normalizeDate(obj.starts_at ?? obj.starts);
    if (v === undefined || v === null) return null;
    patch.starts_at = v;
  }
  if (obj.ends_at !== undefined || obj.ends !== undefined) {
    const v = normalizeDate(obj.ends_at ?? obj.ends);
    if (v === undefined) return null;
    patch.ends_at = v;
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
  const patch = normalizePatch(body);
  if (!patch) return NextResponse.json({ error: "Invalid campaign patch data" }, { status: 400 });

  if (patch.active === true) {
    const supabase = getAdminSupabase();
    await supabase.from("subscription_campaigns").update({ active: false }).eq("active", true).neq("id", id);
  }

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("subscription_campaigns")
    .update(patch)
    .eq("id", id)
    .select(
      `
      id,
      blogger_id,
      channel_id,
      telegram_link,
      goal_subscribers,
      starts_at,
      ends_at,
      active,
      created_at,
      bloggers (name)
    `
    )
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ campaign: data });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const fail = await requireAdmin(req);
  if (fail) return fail;

  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const ok = (req.headers.get("x-confirm") || "").toLowerCase() === "yes";
  if (!ok) return NextResponse.json({ error: "Missing x-confirm: yes header" }, { status: 400 });

  const supabase = getAdminSupabase();
  const { error } = await supabase.from("subscription_campaigns").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

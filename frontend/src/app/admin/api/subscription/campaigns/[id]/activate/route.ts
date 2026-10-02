import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { verifyAdminSession } from "../../../../../../../lib/adminSession";

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

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const fail = await requireAdmin(req);
  if (fail) return fail;

  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = (await req.json().catch(() => null)) as { deactivate?: boolean } | null;
  const deactivate = body?.deactivate === true;

  const supabase = getAdminSupabase();

  if (deactivate) {
    const { data, error } = await supabase
      .from("subscription_campaigns")
      .update({ active: false })
      .eq("id", id)
      .eq("active", true)
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
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, campaign: data ?? null });
  }

  const { data, error } = await supabase.rpc("admin_activate_subscription_campaign", { p_campaign_id: id });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: row, error: rowErr } = await supabase
    .from("subscription_campaigns")
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
    .eq("id", id)
    .single();

  if (rowErr) return NextResponse.json({ error: rowErr.message }, { status: 500 });
  return NextResponse.json({ ok: true, activated: (data as unknown as boolean) ?? true, campaign: row });
}

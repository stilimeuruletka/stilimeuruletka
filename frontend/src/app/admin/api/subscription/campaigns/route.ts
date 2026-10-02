import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { verifyAdminSession } from "../../../../../lib/adminSession";

export const runtime = "nodejs";

type CampaignWithProgress = {
  id: string;
  blogger_id: string;
  blogger_name: string | null;
  channel_id: string;
  telegram_link: string | null;
  goal_subscribers: number;
  starts_at: string;
  ends_at: string | null;
  active: boolean;
  created_at: string;
  confirmed_count: number;
  percent: number;
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

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function normalizeChannelId(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (s.length < 3 || s.length > 64) return null;
  return s;
}

function normalizeTelegramLink(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (s.length === 0) return null;
  if (s.length > 256) return null;
  return s;
}

function normalizeGoal(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v) && v >= 1 && v <= 1_000_000) return Math.floor(v);
  if (typeof v !== "string") return null;
  const n = parseInt(v.trim(), 10);
  if (!Number.isFinite(n) || n < 1 || n > 1_000_000) return null;
  return n;
}

function normalizeDate(v: unknown, required: boolean): string | null {
  if (v === null || v === undefined) return required ? null : null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (s.length === 0) return required ? null : null;
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString();
}

export async function GET(req: Request): Promise<NextResponse> {
  const fail = await requireAdmin(req);
  if (fail) return fail;

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
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
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data as unknown[]) ?? [];
  const ids = rows.map((r: any) => r.id);

  const confirmedMap = new Map<string, number>();
  if (ids.length > 0) {
    const { data: cnt, error: cntErr } = await supabase
      .from("user_subscription_confirmations")
      .select("campaign_id", { count: "exact", head: false });
    if (!cntErr && Array.isArray(cnt)) {
      for (const row of cnt) {
        const cid = (row as any).campaign_id as string;
        confirmedMap.set(cid, (confirmedMap.get(cid) ?? 0) + 1);
      }
    }
  }

  const campaigns: CampaignWithProgress[] = rows.map((r: any) => {
    const goal = Number(r.goal_subscribers) || 0;
    const confirmed = confirmedMap.get(r.id) ?? 0;
    const percent = goal > 0 ? Math.round((confirmed / goal) * 10000) / 100 : 0;
    return {
      id: r.id,
      blogger_id: r.blogger_id,
      blogger_name: r.bloggers?.name ?? null,
      channel_id: r.channel_id,
      telegram_link: r.telegram_link ?? null,
      goal_subscribers: goal,
      starts_at: r.starts_at,
      ends_at: r.ends_at,
      active: !!r.active,
      created_at: r.created_at,
      confirmed_count: confirmed,
      percent
    };
  });

  return NextResponse.json({ campaigns });
}

export async function POST(req: Request): Promise<NextResponse> {
  const fail = await requireAdmin(req);
  if (fail) return fail;

  const body = (await req.json().catch(() => null)) as unknown;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const obj = body as Record<string, unknown>;

  const bloggerId = typeof obj.blogger_id === "string" && isUuid(obj.blogger_id) ? obj.blogger_id : null;
  const channelId = normalizeChannelId(obj.channel_id);
  const telegramLink = normalizeTelegramLink(obj.telegram_link);
  const goal = normalizeGoal(obj.goal_subscribers ?? obj.goal ?? 1000) ?? 1000;
  const startsAt = normalizeDate(obj.starts_at ?? obj.starts ?? new Date().toISOString(), true);
  const endsAtRaw = normalizeDate(obj.ends_at ?? obj.ends ?? null, false);
  const activeRaw = obj.active;
  const activateNow = typeof activeRaw === "boolean" ? activeRaw : activeRaw === "true" || activeRaw === 1 || activeRaw === "1";

  if (!bloggerId || !channelId || !startsAt) {
    return NextResponse.json(
      {
        error:
          "Invalid campaign data: blogger_id (uuid), channel_id (3-64 chars), starts_at (ISO date) are required"
      },
      { status: 400 }
    );
  }

  const supabase = getAdminSupabase();

  if (activateNow) {
    await supabase.from("subscription_campaigns").update({ active: false }).eq("active", true);
  }

  const payload: Record<string, unknown> = {
    blogger_id: bloggerId,
    channel_id: channelId,
    telegram_link: telegramLink,
    goal_subscribers: goal,
    starts_at: startsAt,
    ends_at: endsAtRaw,
    active: activateNow
  };

  const { data, error } = await supabase
    .from("subscription_campaigns")
    .insert(payload)
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
  return NextResponse.json({ campaign: data }, { status: 201 });
}

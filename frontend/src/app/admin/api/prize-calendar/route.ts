import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { verifyAdminSession } from "../../../../lib/adminSession";

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

function isoToDateStr(iso: string): string | null {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function monthRange(period: string): { from: string; to: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  const start = new Date(Date.UTC(y, mo - 1, 1));
  const end = new Date(Date.UTC(y, mo, 0));
  const fmt = (d: Date) => {
    const y2 = d.getUTCFullYear();
    const m2 = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y2}-${m2}-${day}`;
  };
  return { from: fmt(start), to: fmt(end) };
}

export async function GET(req: Request) {
  const fail = await requireAdmin(req);
  if (fail) return fail;

  const url = new URL(req.url);
  const period = url.searchParams.get("period");
  if (!period) return NextResponse.json({ error: "period (YYYY-MM) is required" }, { status: 400 });
  const range = monthRange(period);
  if (!range) return NextResponse.json({ error: "bad period" }, { status: 400 });

  const supabase = getAdminSupabase();
  const { data, error } = await supabase.rpc("prize_calendar_month", {
    p_from: range.from,
    p_to: range.to
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ period, items: data ?? [] });
}

export async function POST(req: Request) {
  const fail = await requireAdmin(req);
  if (fail) return fail;

  const body = (await req.json().catch(() => null)) as unknown;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const obj = body as Record<string, unknown>;
  const dateStr = typeof obj.date === "string" ? isoToDateStr(obj.date) ?? obj.date : null;
  const prizeId = typeof obj.prize_id === "string" ? obj.prize_id : null;
  const amountNum =
    typeof obj.amount === "number" ? obj.amount : obj.amount != null ? Number(obj.amount) : Number.NaN;

  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return NextResponse.json({ error: "date is required (YYYY-MM-DD)" }, { status: 400 });
  }
  if (!prizeId) return NextResponse.json({ error: "prize_id is required" }, { status: 400 });
  if (!Number.isFinite(amountNum) || !Number.isInteger(amountNum) || amountNum < 0 || amountNum > 10_000_000) {
    return NextResponse.json({ error: "amount must be integer 0..10000000" }, { status: 400 });
  }

  const supabase = getAdminSupabase();
  const { data, error } = await supabase.rpc("admin_upsert_prize_calendar", {
    p_prize_date: dateStr,
    p_prize_id: prizeId,
    p_amount: amountNum
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Если amount = 0 — трактуем как "убрать запись" (ничего не выдаётся)
  if (amountNum === 0 && data && (data as { ok?: boolean }).ok) {
    await supabase
      .from("prize_calendar")
      .delete()
      .eq("prize_id", prizeId)
      .eq("prize_date", dateStr);
  }
  return NextResponse.json({ ok: true, result: data });
}

export async function DELETE(req: Request) {
  const fail = await requireAdmin(req);
  if (fail) return fail;

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const supabase = getAdminSupabase();
  const { error } = await supabase.rpc("admin_delete_prize_calendar", { p_id: id });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { verifyAdminSession } from "@/lib/adminSession";

export const runtime = "nodejs";

type CouponSetRow = {
  id: string;
  period: string;
  title: string;
  total_coupons: number;
  created_at: string;
};

type CouponSetStatsRow = {
  id: string;
  period: string;
  title: string;
  total_coupons: number;
  created_at: string;
  redeemed: number;
  remaining: number;
  fill_percent: number;
  unique_users: number;
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

function isValidPeriod(p: unknown): p is string {
  return typeof p === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(p);
}

type CreateInput = {
  period: string;
  title: string;
  total_coupons: number;
};

function normalizeCreateInput(input: unknown): CreateInput | { error: string } {
  if (!input || typeof input !== "object") return { error: "Неверный формат тела запроса" };
  const obj = input as Record<string, unknown>;

  if (!isValidPeriod(obj.period)) return { error: "Период должен быть в формате YYYY-MM (например 2026-10)" };

  const titleRaw = obj.title;
  if (typeof titleRaw !== "string") return { error: "Название набора должно быть строкой" };
  const title = titleRaw.trim();
  if (title.length < 1 || title.length > 180) return { error: "Название набора должно быть от 1 до 180 символов" };

  const totalRaw = typeof obj.total_coupons === "number" ? obj.total_coupons : Number(obj.total_coupons);
  if (!Number.isFinite(totalRaw) || !Number.isInteger(totalRaw) || totalRaw < 0 || totalRaw > 10_000_000) {
    return { error: "Количество купонов должно быть целым числом от 0 до 10 000 000" };
  }

  return { period: obj.period, title, total_coupons: totalRaw };
}

export async function GET(req: Request) {
  const fail = await requireAdmin(req);
  if (fail) return fail;

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("coupon_sets_stats")
    .select(
      "id,period,title,total_coupons,created_at,redeemed,remaining,fill_percent,unique_users"
    )
    .order("period", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (data ?? []) as unknown as CouponSetStatsRow[];

  return NextResponse.json({
    sets: rows.map((r) => ({
      id: r.id,
      period: r.period,
      title: r.title,
      total_coupons: Number(r.total_coupons),
      created_at: r.created_at,
      redeemed: Number(r.redeemed ?? 0),
      remaining: Number(r.remaining ?? 0),
      fill_percent: Number(r.fill_percent ?? 0),
      unique_users: Number(r.unique_users ?? 0)
    }))
  });
}

export async function POST(req: Request) {
  const fail = await requireAdmin(req);
  if (fail) return fail;

  const body = (await req.json().catch(() => null)) as unknown;
  const normalized = normalizeCreateInput(body);
  if ("error" in normalized) {
    return NextResponse.json({ error: normalized.error }, { status: 400 });
  }

  const supabase = getAdminSupabase();

  const { data: existing, error: findErr } = await supabase
    .from("coupon_sets")
    .select("id,period,title")
    .or(`period.eq.${normalized.period},title.eq.${normalized.title.replace(/'/g, "''")}`)
    .limit(2);

  if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 });

  if (Array.isArray(existing) && existing.length > 0) {
    for (const row of existing as Array<{ period: string; title: string }>) {
      if (row.period === normalized.period) {
        return NextResponse.json(
          { error: `Для периода ${normalized.period} уже существует набор купонов` },
          { status: 409 }
        );
      }
      if (row.title === normalized.title) {
        return NextResponse.json(
          { error: `Набор с названием «${normalized.title}» уже существует` },
          { status: 409 }
        );
      }
    }
  }

  const { data, error } = await supabase
    .from("coupon_sets")
    .insert({
      period: normalized.period,
      title: normalized.title,
      total_coupons: normalized.total_coupons
    } as Partial<CouponSetRow>)
    .select("id,period,title,total_coupons,created_at")
    .limit(1)
    .single();

  if (error) {
    const isUnique = /23505|unique|duplicate/i.test(error.message ?? "");
    return NextResponse.json(
      {
        error: isUnique
          ? `Набор уже существует (period=${normalized.period} или title совпадает)`
          : error.message
      },
      { status: isUnique ? 409 : 500 }
    );
  }

  const row = data as unknown as CouponSetRow;
  return NextResponse.json({
    set: {
      id: row.id,
      period: row.period,
      title: row.title,
      total_coupons: Number(row.total_coupons),
      created_at: row.created_at,
      redeemed: 0,
      remaining: Number(row.total_coupons),
      fill_percent: 0,
      unique_users: 0
    }
  });
}

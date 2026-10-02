import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { verifyAdminSession } from "@/lib/adminSession";

export const runtime = "nodejs";

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

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const fail = await requireAdmin(req);
  if (fail) return fail;

  const { id } = await params;
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "Не указан id набора" }, { status: 400 });
  }

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("coupon_sets_stats")
    .select("id,period,title,total_coupons,created_at,redeemed,remaining,fill_percent,unique_users")
    .eq("id", id)
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Набор не найден" }, { status: 404 });

  const row = data as unknown as CouponSetStatsRow;
  return NextResponse.json({
    set: {
      id: row.id,
      period: row.period,
      title: row.title,
      total_coupons: Number(row.total_coupons),
      created_at: row.created_at,
      redeemed: Number(row.redeemed ?? 0),
      remaining: Number(row.remaining ?? 0),
      fill_percent: Number(row.fill_percent ?? 0),
      unique_users: Number(row.unique_users ?? 0)
    }
  });
}

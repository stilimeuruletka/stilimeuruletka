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

function startOfDayUtc(dateStr: string): string {
  return `${dateStr}T00:00:00.000Z`;
}
function endOfDayUtc(dateStr: string): string {
  return `${dateStr}T23:59:59.999Z`;
}

type UserDayDetail = {
  tg_user_id: number;
  username: string | null;
  first_seen_at: string;
  last_seen_at: string;
  spins: number;
  wins: number;
  losses: number;
  coupons: number;
  was_new_user: boolean;
};

export async function GET(req: Request, { params }: { params: Promise<{ date: string }> }) {
  const fail = await requireAdmin(req);
  if (fail) return fail;

  const { date } = await params;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Неверный формат даты YYYY-MM-DD" }, { status: 400 });
  }

  const fromIso = startOfDayUtc(date);
  const toIso = endOfDayUtc(date);
  const supabase = getAdminSupabase();

  try {
    const [spinsQ, usersSeenQ, couponsQ, newUsersQ] = await Promise.all([
      supabase
        .from("spins")
        .select("created_at, win, prize_id, users!inner(tg_user_id, username), prizes(title)")
        .gte("created_at", fromIso)
        .lte("created_at", toIso)
        .order("created_at", { ascending: true }),
      supabase
        .from("users")
        .select("tg_user_id, username, created_at, last_seen_at")
        .gte("last_seen_at", fromIso)
        .lte("last_seen_at", toIso),
      (async () => {
        try {
          return await supabase
            .from("coupon_redemptions")
            .select("created_at, user_id, users!inner(tg_user_id, username), coupon_type, coupon_set_id")
            .gte("created_at", fromIso)
            .lte("created_at", toIso);
        } catch {
          return { data: [], error: null };
        }
      })(),
      supabase
        .from("users")
        .select("tg_user_id, username, created_at")
        .gte("created_at", fromIso)
        .lte("created_at", toIso)
    ]);

    const spinTimeline: Array<{
      created_at: string;
      tg_user_id: number;
      username: string | null;
      win: boolean;
      prize_title: string | null;
    }> = [];

    const aggMap = new Map<number, UserDayDetail>();

    const newUserIds = new Set<number>();
    if (!newUsersQ.error && Array.isArray(newUsersQ.data)) {
      for (const u of newUsersQ.data as unknown as Array<{ tg_user_id: number }>) {
        newUserIds.add(Number(u.tg_user_id));
      }
    }

    const couponsPerUser = new Map<number, number>();
    const couponTimeline: Array<{
      created_at: string;
      tg_user_id: number;
      username: string | null;
      coupon_type: string;
    }> = [];
    if (!couponsQ.error && Array.isArray(couponsQ.data)) {
      for (const r of couponsQ.data as unknown as Array<{
        created_at: string;
        users: { tg_user_id: number; username: string | null };
        coupon_type: string;
      }>) {
        const uid = Number(r.users?.tg_user_id);
        if (!Number.isFinite(uid) || uid <= 0) continue;
        couponsPerUser.set(uid, (couponsPerUser.get(uid) ?? 0) + 1);
        couponTimeline.push({
          created_at: r.created_at,
          tg_user_id: uid,
          username: r.users?.username ?? null,
          coupon_type: r.coupon_type
        });
      }
    }

    if (!usersSeenQ.error && Array.isArray(usersSeenQ.data)) {
      for (const u of usersSeenQ.data as unknown as Array<{
        tg_user_id: number;
        username: string | null;
        created_at: string;
        last_seen_at: string;
      }>) {
        const uid = Number(u.tg_user_id);
        if (!Number.isFinite(uid) || uid <= 0) continue;
        aggMap.set(uid, {
          tg_user_id: uid,
          username: u.username ?? null,
          first_seen_at: u.created_at,
          last_seen_at: u.last_seen_at ?? u.created_at,
          spins: 0,
          wins: 0,
          losses: 0,
          coupons: 0,
          was_new_user: newUserIds.has(uid)
        });
      }
    }

    if (!spinsQ.error && Array.isArray(spinsQ.data)) {
      for (const r of spinsQ.data as unknown as Array<{
        created_at: string;
        win: boolean;
        prize_id: string | null;
        users: { tg_user_id: number; username: string | null };
        prizes: { title: string } | null;
      }>) {
        const uid = Number(r.users?.tg_user_id);
        if (!Number.isFinite(uid) || uid <= 0) continue;
        spinTimeline.push({
          created_at: r.created_at,
          tg_user_id: uid,
          username: r.users?.username ?? null,
          win: !!r.win,
          prize_title: r.prizes?.title ?? null
        });
        const cur = aggMap.get(uid) ?? {
          tg_user_id: uid,
          username: r.users?.username ?? null,
          first_seen_at: r.created_at,
          last_seen_at: r.created_at,
          spins: 0,
          wins: 0,
          losses: 0,
          coupons: 0,
          was_new_user: newUserIds.has(uid)
        };
        cur.spins += 1;
        if (r.win) cur.wins += 1; else cur.losses += 1;
        if (r.created_at > cur.last_seen_at) cur.last_seen_at = r.created_at;
        aggMap.set(uid, cur);
      }
    }

    for (const [uid, coupons] of couponsPerUser.entries()) {
      const cur = aggMap.get(uid);
      if (!cur) continue;
      cur.coupons = coupons;
    }

    const usersList = Array.from(aggMap.values()).sort((a, b) => {
      if (a.spins !== b.spins) return b.spins - a.spins;
      if (a.last_seen_at < b.last_seen_at) return 1;
      if (a.last_seen_at > b.last_seen_at) return -1;
      return 0;
    });

    const timeline = [...spinTimeline, ...couponTimeline.map((c) => ({
      created_at: c.created_at,
      tg_user_id: c.tg_user_id,
      username: c.username,
      win: false,
      prize_title: `🏷️ Купон: ${c.coupon_type || "—"}`
    }))].sort((a, b) => (a.created_at < b.created_at ? -1 : 1));

    const totals = usersList.reduce(
      (acc, u) => {
        acc.unique_users += 1;
        acc.spins += u.spins;
        acc.wins += u.wins;
        acc.losses += u.losses;
        acc.coupons += u.coupons;
        if (u.was_new_user) acc.new_users += 1;
        return acc;
      },
      { unique_users: 0, spins: 0, wins: 0, losses: 0, coupons: 0, new_users: 0 }
    );

    return NextResponse.json({
      date,
      from: fromIso,
      to: toIso,
      users: usersList,
      timeline,
      totals
    });
  } catch (e) {
    console.error("[admin/api/dashboard/daily/[date]/details] failed", e);
    return NextResponse.json({ error: "Не удалось загрузить детализацию дня" }, { status: 500 });
  }
}

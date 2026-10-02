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

function startOfDay(d: Date, msOffset = 0): string {
  const copy = new Date(d.getTime() + msOffset);
  copy.setUTCHours(0, 0, 0, 0);
  return copy.toISOString();
}
function endOfDay(d: Date, msOffset = 0): string {
  const copy = new Date(d.getTime() + msOffset);
  copy.setUTCHours(23, 59, 59, 999);
  return copy.toISOString();
}

const DAY_MS = 24 * 60 * 60 * 1000;

export async function GET(req: Request) {
  const fail = await requireAdmin(req);
  if (fail) return fail;

  const supabase = getAdminSupabase();
  const now = new Date();
  const nowIso = now.toISOString();
  const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const yesterdayStart = startOfDay(now, -DAY_MS);
  const yesterdayEnd = endOfDay(now, -DAY_MS);
  const last24hStart = new Date(now.getTime() - DAY_MS).toISOString();

  try {
    const [
      onlineQ,
      todaySpinsQ,
      yesterdaySpinsQ,
      last24hSpinsQ,
      todayCouponsQ,
      last24hPrizeBreakdownQ,
      topBloggerQ
    ] = await Promise.all([
      supabase
        .from("users")
        .select("id", { count: "exact", head: false })
        .gte("last_seen_at", fiveMinAgo)
        .lte("last_seen_at", nowIso),
      supabase
        .from("spins")
        .select("id,win", { count: "exact" })
        .gte("created_at", todayStart)
        .lte("created_at", todayEnd),
      supabase
        .from("spins")
        .select("id,win", { count: "exact" })
        .gte("created_at", yesterdayStart)
        .lte("created_at", yesterdayEnd),
      supabase
        .from("spins")
        .select("id,win")
        .gte("created_at", last24hStart)
        .lte("created_at", nowIso),
      (async () => {
        try {
          return await supabase
            .from("coupon_redemptions")
            .select("id", { count: "exact", head: false })
            .gte("created_at", todayStart)
            .lte("created_at", todayEnd);
        } catch {
          return { data: [], count: 0, error: null };
        }
      })(),
      supabase
        .from("spins")
        .select("win, prize_id, prizes!inner(id,title)")
        .gte("created_at", last24hStart)
        .lte("created_at", nowIso),
      (async () => {
        try {
          const { data: clicks, error } = await supabase
            .from("blogger_clicks")
            .select("blogger_id, bloggers!inner(id,code,name)")
            .gte("created_at", last24hStart)
            .lte("created_at", nowIso);
          if (error || !Array.isArray(clicks)) {
            return { data: null };
          }
          const map = new Map<string, { blogger_id: string; code: string; name: string; clicks: number; registrations: number }>();
          for (const row of clicks as unknown as Array<{
            blogger_id: string;
            bloggers: { id: string; code: string; name: string } | null;
          }>) {
            if (!row.bloggers) continue;
            const cur = map.get(row.blogger_id) ?? {
              blogger_id: row.bloggers.id,
              code: row.bloggers.code,
              name: row.bloggers.name,
              clicks: 0,
              registrations: 0
            };
            cur.clicks += 1;
            map.set(row.blogger_id, cur);
          }
          const top = Array.from(map.values()).sort((a, b) => b.clicks - a.clicks)[0] ?? null;
          return { data: top };
        } catch {
          return { data: null };
        }
      })()
    ]);

    const todaySpins = Number(todaySpinsQ.count ?? 0);
    const yesterdaySpins = Number(yesterdaySpinsQ.count ?? 0);
    const todayDelta = yesterdaySpins === 0 ? 100 : Math.round(((todaySpins - yesterdaySpins) / yesterdaySpins) * 100);
    const todayWins = Array.isArray(todaySpinsQ.data)
      ? todaySpinsQ.data.filter((s) => (s as { win: boolean }).win).length
      : 0;
    const yesterdayWins = Array.isArray(yesterdaySpinsQ.data)
      ? yesterdaySpinsQ.data.filter((s) => (s as { win: boolean }).win).length
      : 0;
    const winsDelta =
      yesterdayWins === 0 ? (todayWins === 0 ? 0 : 100) : Math.round(((todayWins - yesterdayWins) / yesterdayWins) * 100);

    const last24hTotal = Array.isArray(last24hSpinsQ.data) ? last24hSpinsQ.data.length : 0;
    const last24hWins = Array.isArray(last24hSpinsQ.data)
      ? (last24hSpinsQ.data as Array<{ win: boolean }>).filter((s) => s.win).length
      : 0;
    const winRate24h = last24hTotal === 0 ? 0 : Math.round((last24hWins / last24hTotal) * 10000) / 100;

    const todayCoupons = Number(todayCouponsQ.count ?? 0);

    const prizeMap = new Map<string, { prize_id: string; title: string; count: number; wins: number }>();
    if (!last24hPrizeBreakdownQ.error && Array.isArray(last24hPrizeBreakdownQ.data)) {
      for (const row of last24hPrizeBreakdownQ.data as unknown as Array<{
        win: boolean;
        prize_id: string | null;
        prizes: { id: string; title: string } | null;
      }>) {
        const id = row.prize_id || "__null__";
        const title = row.prizes?.title ?? "Ничего";
        const cur = prizeMap.get(id) ?? { prize_id: id, title, count: 0, wins: 0 };
        cur.count += 1;
        if (row.win && id !== "__null__") cur.wins += 1;
        prizeMap.set(id, cur);
      }
    }
    const topPrize =
      Array.from(prizeMap.values()).sort((a, b) => b.count - a.count)[0] ?? null;

    return NextResponse.json({
      now: nowIso,
      online_users: Number(onlineQ.count ?? 0),
      today: {
        spins: todaySpins,
        wins: todayWins,
        delta_spins_percent: todayDelta,
        delta_wins_percent: winsDelta,
        coupons_issued: todayCoupons
      },
      yesterday: {
        spins: yesterdaySpins,
        wins: yesterdayWins
      },
      last_24h: {
        spins: last24hTotal,
        wins: last24hWins,
        win_rate_percent: winRate24h,
        top_prize: topPrize
          ? { prize_id: topPrize.prize_id === "__null__" ? null : topPrize.prize_id, title: topPrize.title, count: topPrize.count }
          : null
      },
      top_blogger_24h: topBloggerQ.data
        ? {
            blogger_id: (topBloggerQ.data as { blogger_id: string; code: string; name: string; clicks: number }).blogger_id,
            name: (topBloggerQ.data as { blogger_id: string; code: string; name: string; clicks: number }).name,
            code: (topBloggerQ.data as { blogger_id: string; code: string; name: string; clicks: number }).code,
            clicks: (topBloggerQ.data as { blogger_id: string; code: string; name: string; clicks: number }).clicks
          }
        : null
    });
  } catch (e) {
    console.error("[admin/api/dashboard/realtime] failed", e);
    return NextResponse.json({ error: "Не удалось загрузить данные реального времени" }, { status: 500 });
  }
}

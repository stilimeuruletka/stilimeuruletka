import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { verifyAdminSession } from "../../../../../lib/adminSession";

export const runtime = "nodejs";

type OverviewRow = {
  users_created: number;
  active_users: number;
  total_spins: number;
  wins: number;
  losses: number;
};

type RecentSpinRow = {
  created_at: string;
  tg_user_id: number;
  username: string | null;
  prize_title: string | null;
  win: boolean;
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

function parseMaybeIso(input: string | null) {
  if (!input) return null;
  const ms = Date.parse(input);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

export async function GET(req: Request) {
  const fail = await requireAdmin(req);
  if (fail) return fail;

  const url = new URL(req.url);
  const from = parseMaybeIso(url.searchParams.get("from"));
  const to = parseMaybeIso(url.searchParams.get("to"));

  const fromTs = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const toTs = to ? new Date(to) : new Date();
  const fromIso = fromTs.toISOString();
  const toIso = toTs.toISOString();

  const supabase = getAdminSupabase();

  const [usersCountQ, activeQ, spinsQ, breakdownQ, recentQ] = await Promise.all([
    supabase
      .from("users")
      .select("id", { count: "exact", head: false })
      .gte("created_at", fromIso)
      .lte("created_at", toIso),
    supabase
      .from("users")
      .select("id", { count: "exact", head: false })
      .gte("last_seen_at", fromIso)
      .lte("last_seen_at", toIso),
    supabase
      .from("spins")
      .select("id,win", { count: "exact" })
      .gte("created_at", fromIso)
      .lte("created_at", toIso),
    supabase
      .from("spins")
      .select("prize_id, prizes!inner(id,title)")
      .gte("created_at", fromIso)
      .lte("created_at", toIso),
    supabase
      .from("spins")
      .select("created_at, win, prize_id, users!inner(tg_user_id, username), prizes(id, title)")
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .order("created_at", { ascending: false })
      .limit(100)
  ]);

  const totalSpins = Number(spinsQ.count ?? 0);
  const winsCount = Array.isArray(spinsQ.data)
    ? spinsQ.data.filter((s) => (s as { win: boolean }).win).length
    : 0;
  const lossesCount = Math.max(0, totalSpins - winsCount);

  const overview: OverviewRow = {
    users_created: Number(usersCountQ.count ?? 0),
    active_users: Number(activeQ.count ?? 0),
    total_spins: totalSpins,
    wins: winsCount,
    losses: lossesCount
  };

  const breakdownMap = new Map<string, { prize_id: string | null; prize_title: string | null; count: number }>();
  if (Array.isArray(breakdownQ.data)) {
    for (const row of breakdownQ.data as unknown as Array<{
      prize_id: string | null;
      prizes: { id: string; title: string } | null;
    }>) {
      const prizeId = row.prize_id ?? null;
      const prizeTitle = row.prizes?.title ?? null;
      const key = prizeId || "__null__";
      const cur = breakdownMap.get(key);
      if (cur) {
        cur.count += 1;
      } else {
        breakdownMap.set(key, { prize_id: prizeId, prize_title: prizeTitle ?? "Ничего", count: 1 });
      }
    }
  }
  const totalBreakdown = Array.from(breakdownMap.values()).reduce((a, b) => a + b.count, 0) || 1;
  const prize_breakdown = Array.from(breakdownMap.values())
    .map((b) => ({
      prize_id: b.prize_id,
      prize_title: b.prize_title ?? "Ничего",
      count: b.count,
      win_count_share_percent: Math.round((b.count / totalBreakdown) * 10000) / 100
    }))
    .sort((a, b) => b.count - a.count);

  const recent_spins: RecentSpinRow[] = Array.isArray(recentQ.data)
    ? (recentQ.data as unknown as Array<{
        created_at: string;
        win: boolean;
        prize_id: string | null;
        users: { tg_user_id: number; username: string | null };
        prizes: { id: string; title: string } | null;
      }>).map((r) => ({
        created_at: r.created_at,
        tg_user_id: Number(r.users?.tg_user_id) || 0,
        username: r.users?.username ?? null,
        prize_title: r.prizes?.title ?? null,
        win: Boolean(r.win)
      }))
    : [];

  return NextResponse.json({
    range: { from: fromIso, to: toIso },
    overview,
    prize_breakdown,
    recent_spins
  });
}

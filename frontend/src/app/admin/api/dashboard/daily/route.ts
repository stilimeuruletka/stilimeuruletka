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

export async function GET(req: Request) {
  const fail = await requireAdmin(req);
  if (fail) return fail;

  const url = new URL(req.url);
  const daysParam = Number(url.searchParams.get("days"));
  const days = Number.isFinite(daysParam) && daysParam > 0 && daysParam <= 90 ? Math.trunc(daysParam) : 14;

  const now = new Date();
  now.setUTCHours(23, 59, 59, 999);
  const toMs = now.getTime();
  const fromMs = new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  fromMs.setUTCHours(0, 0, 0, 0);

  const fromIso = fromMs.toISOString();
  const toIso = now.toISOString();

  const supabase = getAdminSupabase();
  try {
    const dateBuckets: Map<
      string,
      { date: string; weekday: string; unique_users: Set<number>; spins: number; wins: number; new_users: Set<number> }
    > = new Map();

    for (let i = 0; i < days; i += 1) {
      const d = new Date(fromMs.getTime() + i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().substring(0, 10);
      const ru = ["Вос", "Пон", "Вто", "Сре", "Чет", "Пят", "Суб"][d.getUTCDay()];
      dateBuckets.set(key, {
        date: key,
        weekday: ru,
        unique_users: new Set(),
        spins: 0,
        wins: 0,
        new_users: new Set()
      });
    }

    const [spinsQ, newUsersQ] = await Promise.all([
      supabase
        .from("spins")
        .select("created_at, win, users!inner(tg_user_id)")
        .gte("created_at", fromIso)
        .lte("created_at", toIso),
      supabase
        .from("users")
        .select("created_at, tg_user_id")
        .gte("created_at", fromIso)
        .lte("created_at", toIso)
    ]);

    if (!spinsQ.error && Array.isArray(spinsQ.data)) {
      for (const row of spinsQ.data as unknown as Array<{
        created_at: string;
        win: boolean;
        users: { tg_user_id: number };
      }>) {
        const key = row.created_at.substring(0, 10);
        const bucket = dateBuckets.get(key);
        if (!bucket) continue;
        bucket.spins += 1;
        if (row.win) bucket.wins += 1;
        const uid = Number(row.users?.tg_user_id);
        if (Number.isFinite(uid) && uid > 0) bucket.unique_users.add(uid);
      }
    }

    if (!newUsersQ.error && Array.isArray(newUsersQ.data)) {
      for (const row of newUsersQ.data as unknown as Array<{ created_at: string; tg_user_id: number }>) {
        const key = row.created_at.substring(0, 10);
        const bucket = dateBuckets.get(key);
        if (!bucket) continue;
        const uid = Number(row.tg_user_id);
        if (Number.isFinite(uid) && uid > 0) bucket.new_users.add(uid);
      }
    }

    const daysArray = Array.from(dateBuckets.values())
      .map((b) => ({
        date: b.date,
        weekday: b.weekday,
        unique_users: b.unique_users.size,
        spins: b.spins,
        wins: b.wins,
        losses: Math.max(0, b.spins - b.wins),
        win_rate_percent: b.spins === 0 ? 0 : Math.round((b.wins / b.spins) * 10000) / 100,
        new_users: b.new_users.size
      }))
      .sort((a, b) => (a.date < b.date ? 1 : -1));

    const totals = daysArray.reduce(
      (acc, d) => {
        acc.unique_users += d.unique_users;
        acc.spins += d.spins;
        acc.wins += d.wins;
        acc.new_users += d.new_users;
        return acc;
      },
      { unique_users: 0, spins: 0, wins: 0, new_users: 0 }
    );

    return NextResponse.json({
      range: { from: fromIso, to: toIso, days },
      days: daysArray,
      totals
    });
  } catch (e) {
    console.error("[admin/api/dashboard/daily] failed", e);
    return NextResponse.json({ error: "Не удалось загрузить статистику по дням" }, { status: 500 });
  }
}

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

function parseMaybeIso(input: string | null) {
  if (!input) return null;
  const ms = Date.parse(input);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function parseMaybeInt(input: string | null, min = 0) {
  if (input == null) return null;
  const v = Number(input);
  if (!Number.isFinite(v)) return null;
  const n = Math.trunc(v);
  if (n < min) return null;
  return n;
}

type AggUserRow = {
  user_id: string;
  tg_user_id: number;
  username: string | null;
  created_at: string;
  last_seen_at: string | null;
  total_spins: number;
  wins: number;
  losses: number;
  last_spin_at: string | null;
  referrals: number;
  invited_by_tg_id: number | null;
  coupons: number;
};

export async function GET(req: Request) {
  const fail = await requireAdmin(req);
  if (fail) return fail;

  const url = new URL(req.url);
  const from = parseMaybeIso(url.searchParams.get("from"));
  const to = parseMaybeIso(url.searchParams.get("to"));
  const q = url.searchParams.get("q")?.trim() || null;
  const winFilter = url.searchParams.get("win_filter") as "winners" | "losers" | "zero" | null;
  const minSpins = parseMaybeInt(url.searchParams.get("min_spins"));
  const maxSpins = parseMaybeInt(url.searchParams.get("max_spins"));
  const hasRef = url.searchParams.get("has_ref") === "1";
  const invited = url.searchParams.get("invited") === "1";
  const hasCoupons = url.searchParams.get("has_coupons") === "1";
  const sort = (url.searchParams.get("sort") || "total_spins") as
    | "total_spins"
    | "wins"
    | "losses"
    | "last_spin_at"
    | "tg_user_id"
    | "created_at"
    | "referrals"
    | "coupons";
  const order = (url.searchParams.get("order") || "desc") as "asc" | "desc";
  const limit = Math.min(parseMaybeInt(url.searchParams.get("limit"), 1) ?? 500, 2000);
  const offset = Math.max(parseMaybeInt(url.searchParams.get("offset"), 0) ?? 0, 0);

  const fromIso = from ?? new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
  const toIso = to ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const supabase = getAdminSupabase();
  try {
    const spinsAgg = supabase
      .from("spins")
      .select("user_id", { count: "exact", head: false })
      .gte("created_at", fromIso)
      .lte("created_at", toIso);

    const couponsAgg = supabase
      .from("coupon_redemptions")
      .select("user_id", { count: "exact", head: false })
      .gte("created_at", fromIso)
      .lte("created_at", toIso);

    const userIdsFromSpins = new Set<string>();
    const spinCounts = new Map<string, { wins: number; losses: number; last_spin_at: string | null }>();
    const { data: spinRows, error: spinsErr } = await spinsAgg;
    if (spinsErr) throw spinsErr;
    if (Array.isArray(spinRows)) {
      const { data: det, error: detErr } = await supabase
        .from("spins")
        .select("user_id,win,created_at")
        .gte("created_at", fromIso)
        .lte("created_at", toIso);
      if (detErr) throw detErr;
      const lastMap = new Map<string, string>();
      if (Array.isArray(det)) {
        for (const r of det as unknown as Array<{ user_id: string; win: boolean; created_at: string }>) {
          userIdsFromSpins.add(r.user_id);
          const cur = spinCounts.get(r.user_id) ?? { wins: 0, losses: 0, last_spin_at: null };
          if (r.win) cur.wins += 1; else cur.losses += 1;
          const prev = lastMap.get(r.user_id);
          if (!prev || r.created_at > prev) {
            lastMap.set(r.user_id, r.created_at);
            cur.last_spin_at = r.created_at;
          }
          spinCounts.set(r.user_id, cur);
        }
      }
    }

    const userCouponCounts = new Map<string, number>();
    try {
      const { data: cr, error: crErr } = await couponsAgg;
      if (crErr) throw crErr;
      if (Array.isArray(cr)) {
        const { data: crDet, error: crdErr } = await supabase
          .from("coupon_redemptions")
          .select("user_id")
          .gte("created_at", fromIso)
          .lte("created_at", toIso);
        if (crdErr) throw crdErr;
        if (Array.isArray(crDet)) {
          for (const r of crDet as unknown as Array<{ user_id: string }>) {
            userCouponCounts.set(r.user_id, (userCouponCounts.get(r.user_id) ?? 0) + 1);
          }
        }
      }
    } catch (e) {
      // coupon_redemptions may not exist yet in older schemas, ignore.
    }

    const usersQ = supabase
      .from("users")
      .select("id, tg_user_id, username, created_at, last_seen_at")
      .gte("created_at", fromIso.length === 24 ? fromIso.substring(0, 10) + "T00:00:00.000Z" : fromIso)
      .lte("created_at", toIso);

    const { data: usersRaw, error: usersErr } = await usersQ;
    if (usersErr) throw usersErr;

    const usersList = Array.isArray(usersRaw)
      ? (usersRaw as unknown as Array<{
          id: string;
          tg_user_id: number;
          username: string | null;
          created_at: string;
          last_seen_at: string | null;
        }>)
      : [];

    const userIdToTgId = new Map<string, number>();
    for (const u of usersList) userIdToTgId.set(u.id, Number(u.tg_user_id));

    const refCounts = new Map<string, number>();
    const inviterOf = new Map<string, number>();
    try {
      const { data: refs, error: refErr } = await supabase.from("referrals").select("referrer_id, invited_user_id");
      if (!refErr && Array.isArray(refs)) {
        for (const r of refs as unknown as Array<{ referrer_id: string; invited_user_id: string }>) {
          refCounts.set(r.referrer_id, (refCounts.get(r.referrer_id) ?? 0) + 1);
          const inviterTg = userIdToTgId.get(r.referrer_id);
          if (inviterTg) inviterOf.set(r.invited_user_id, inviterTg);
        }
      }
    } catch {
      // ignore if referrals table empty
    }

    for (const id of userIdsFromSpins) userIdToTgId.set(id, userIdToTgId.get(id) ?? 0);

    const augmented: Array<{
      id: string;
      tg_user_id: number;
      username: string | null;
      created_at: string;
      last_seen_at: string | null;
      total_spins: number;
      wins: number;
      losses: number;
      last_spin_at: string | null;
      referrals: number;
      invited_by_tg_id: number | null;
      coupons: number;
    }> = [];

    for (const u of usersList) {
      const sc = spinCounts.get(u.id) ?? { wins: 0, losses: 0, last_spin_at: null };
      const total_spins = sc.wins + sc.losses;
      augmented.push({
        id: u.id,
        tg_user_id: Number(u.tg_user_id),
        username: u.username,
        created_at: u.created_at,
        last_seen_at: u.last_seen_at,
        total_spins,
        wins: sc.wins,
        losses: sc.losses,
        last_spin_at: sc.last_spin_at,
        referrals: refCounts.get(u.id) ?? 0,
        invited_by_tg_id: inviterOf.get(u.id) ?? null,
        coupons: userCouponCounts.get(u.id) ?? 0
      });
    }

    let filtered = augmented;

    if (q) {
      const lower = q.toLowerCase();
      const asTgId = Number(lower);
      const hasAt = lower.startsWith("@") ? lower.slice(1) : lower;
      filtered = filtered.filter((u) => {
        if (!Number.isNaN(asTgId) && u.tg_user_id === asTgId) return true;
        if (u.username && u.username.toLowerCase().includes(hasAt)) return true;
        if (String(u.tg_user_id) === lower) return true;
        return false;
      });
    }

    if (winFilter === "winners") filtered = filtered.filter((u) => u.wins > 0);
    else if (winFilter === "losers") filtered = filtered.filter((u) => u.total_spins > 0 && u.wins === 0);
    else if (winFilter === "zero") filtered = filtered.filter((u) => u.total_spins === 0);

    if (minSpins != null) filtered = filtered.filter((u) => u.total_spins >= minSpins);
    if (maxSpins != null) filtered = filtered.filter((u) => u.total_spins <= maxSpins);
    if (hasRef) filtered = filtered.filter((u) => u.referrals > 0);
    if (invited) filtered = filtered.filter((u) => u.invited_by_tg_id != null);
    if (hasCoupons) filtered = filtered.filter((u) => (u.coupons ?? 0) > 0);

    filtered.sort((a, b) => {
      let av: number | string | null = 0;
      let bv: number | string | null = 0;
      switch (sort) {
        case "wins": av = a.wins; bv = b.wins; break;
        case "losses": av = a.losses; bv = b.losses; break;
        case "last_spin_at": av = a.last_spin_at || ""; bv = b.last_spin_at || ""; break;
        case "tg_user_id": av = a.tg_user_id; bv = b.tg_user_id; break;
        case "created_at": av = a.created_at; bv = b.created_at; break;
        case "referrals": av = a.referrals; bv = b.referrals; break;
        case "coupons": av = a.coupons ?? 0; bv = b.coupons ?? 0; break;
        default: av = a.total_spins; bv = b.total_spins;
      }
      if (av < bv) return order === "asc" ? -1 : 1;
      if (av > bv) return order === "asc" ? 1 : -1;
      return 0;
    });

    const total = filtered.length;
    const page = filtered.slice(offset, offset + limit).map<AggUserRow>((u) => ({
      user_id: u.id,
      tg_user_id: u.tg_user_id,
      username: u.username,
      created_at: u.created_at,
      last_seen_at: u.last_seen_at,
      total_spins: u.total_spins,
      wins: u.wins,
      losses: u.losses,
      last_spin_at: u.last_spin_at,
      referrals: u.referrals,
      invited_by_tg_id: u.invited_by_tg_id,
      coupons: u.coupons ?? 0
    }));

    return NextResponse.json({
      stats: page,
      pagination: { total, limit, offset },
      filters: { from: fromIso, to: toIso, q, winFilter, minSpins, maxSpins, hasRef, invited, hasCoupons, sort, order }
    });
  } catch (e) {
    console.error("[admin/api/users/stats] failed", e);
    return NextResponse.json({ error: "Не удалось загрузить статистику" }, { status: 500 });
  }
}


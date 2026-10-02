import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { verifyAdminSession } from "@/lib/adminSession";

export const runtime = "nodejs";

type RedemptionRow = {
  id: string;
  coupon_set_id: string;
  spin_id: string | null;
  user_id: string | null;
  tg_user_id: number | null;
  username: string | null;
  coupon_type: string;
  created_at: string;
  per_user_total?: number;
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

type SortKey = "created_at" | "username" | "coupon_type" | "tg_user_id";
const SORT_KEYS: readonly SortKey[] = ["created_at", "username", "coupon_type", "tg_user_id"];

export async function GET(req: Request) {
  const fail = await requireAdmin(req);
  if (fail) return fail;

  const supabase = getAdminSupabase();
  const url = new URL(req.url);

  const setId = url.searchParams.get("set_id") || null;
  const user = url.searchParams.get("user") || null;
  const couponType = url.searchParams.get("coupon_type") || null;
  const from = parseMaybeIso(url.searchParams.get("from"));
  const to = parseMaybeIso(url.searchParams.get("to"));

  const rawSort = url.searchParams.get("sort");
  const sort: SortKey = SORT_KEYS.includes(rawSort as SortKey) ? (rawSort as SortKey) : "created_at";
  const order = url.searchParams.get("order") === "asc" ? true : false;

  const rawLimit = Number(url.searchParams.get("limit"));
  const limit = Number.isInteger(rawLimit) && rawLimit > 0 && rawLimit <= 5000 ? rawLimit : 500;

  let q = supabase
    .from("coupon_redemptions")
    .select("id,coupon_set_id,spin_id,user_id,tg_user_id,username,coupon_type,created_at");

  if (setId) q = q.eq("coupon_set_id", setId);
  if (couponType) q = q.ilike("coupon_type", `%${couponType.replace(/%/g, "\\%")}%`);
  if (from) q = q.gte("created_at", from);
  if (to) q = q.lte("created_at", to);
  if (user) {
    const tgNum = Number(user);
    if (Number.isFinite(tgNum) && Number.isInteger(tgNum)) {
      q = q.or(`username.ilike.%${user.replace(/%/g, "\\%")}%,tg_user_id.eq.${tgNum}`);
    } else {
      q = q.ilike("username", `%${user.replace(/%/g, "\\%")}%`);
    }
  }

  q = q.order(sort, { ascending: order }).limit(limit);
  const { data: rowsData, error: rowsErr } = await q;

  if (rowsErr) return NextResponse.json({ error: rowsErr.message }, { status: 500 });
  const rows = (Array.isArray(rowsData) ? rowsData : []) as RedemptionRow[];

  const tgIds = rows.map((r) => r.tg_user_id).filter((x): x is number => typeof x === "number");
  const perUserTotal = new Map<number, number>();

  if (tgIds.length > 0) {
    const tgUnique = Array.from(new Set(tgIds));
    let countsOk = false;
    try {
      const rpcRes = await supabase.rpc("coupon_redemptions_per_user", {
        tg_user_ids: tgUnique,
        scoped_set_id: setId
      } as unknown as Record<string, unknown>);
      if (!rpcRes.error && Array.isArray(rpcRes.data)) {
        for (const row of rpcRes.data as unknown as Array<{ tg_user_id: number; total: number }>) {
          perUserTotal.set(Number(row.tg_user_id), Number(row.total ?? 0));
        }
        countsOk = true;
      }
    } catch {
      countsOk = false;
    }
    if (!countsOk) {
      let fq = supabase.from("coupon_redemptions").select("tg_user_id");
      fq = fq.in("tg_user_id", tgUnique);
      if (setId) fq = fq.eq("coupon_set_id", setId);
      const { data: fbRows, error: fbErr } = await fq;
      if (!fbErr && Array.isArray(fbRows)) {
        for (const row of fbRows as unknown as Array<{ tg_user_id: number | null }>) {
          if (typeof row.tg_user_id === "number") {
            perUserTotal.set(row.tg_user_id, (perUserTotal.get(row.tg_user_id) ?? 0) + 1);
          }
        }
      }
    }
  }

  const enriched: RedemptionRow[] = rows.map((r) => ({
    id: r.id,
    coupon_set_id: r.coupon_set_id,
    spin_id: r.spin_id ?? null,
    user_id: r.user_id ?? null,
    tg_user_id: typeof r.tg_user_id === "number" ? r.tg_user_id : Number(r.tg_user_id) || null,
    username: r.username ?? null,
    coupon_type: r.coupon_type ?? "",
    created_at: r.created_at,
    per_user_total: typeof r.tg_user_id === "number" ? perUserTotal.get(r.tg_user_id) ?? 0 : 0
  }));

  const filters = {
    set_id: setId,
    user: user,
    coupon_type: couponType,
    from: from,
    to: to,
    sort: sort,
    order: order ? "asc" : "desc",
    limit
  };

  return NextResponse.json({
    filters,
    total: enriched.length,
    redemptions: enriched
  });
}

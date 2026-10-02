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
  return session;
}

function parseMaybeBigInt(input: string | null) {
  if (input == null) return null;
  const v = Number(input);
  if (!Number.isFinite(v) || !Number.isInteger(v) || v <= 0) return null;
  return v;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin(req);
  if ((admin as unknown as { error?: string })?.error) return admin as unknown as NextResponse;

  const { id } = await params;
  const tgUserId = parseMaybeBigInt(id);
  if (!tgUserId) return NextResponse.json({ error: "Invalid user id" }, { status: 400 });

  const supabase = getAdminSupabase();
  try {
    const { data: userRaw, error: userErr } = await supabase
      .from("users")
      .select("id, tg_user_id, username, created_at, last_seen_at, banned_at, ban_reason, ban_until, admin_note, ref_code")
      .eq("tg_user_id", tgUserId)
      .limit(1)
      .maybeSingle();
    if (userErr) throw userErr;
    if (!userRaw) return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });

    const user = userRaw as unknown as {
      id: string;
      tg_user_id: number;
      username: string | null;
      created_at: string;
      last_seen_at: string | null;
      banned_at: string | null;
      ban_reason: string | null;
      ban_until: string | null;
      admin_note: string | null;
      ref_code: string | null;
    };

    const [balanceQ, refsQ, inviteesQ, spinsQ, couponsQ, cooldownQ] = await Promise.all([
      supabase.from("ticket_ledger").select("delta").eq("user_id", user.id),
      supabase.from("referrals").select("referrer_id, invited_user_id, created_at").eq("referrer_id", user.id),
      supabase
        .from("referrals")
        .select("referrer_id, invited_user_id, created_at, referrer:users!referrals_referrer_id_fkey(tg_user_id,username)")
        .eq("invited_user_id", user.id)
        .maybeSingle(),
      supabase
        .from("spins")
        .select("created_at, win, prize_id, prizes(title)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100),
      (async () => {
        try {
          return await supabase
            .from("coupon_redemptions")
            .select("created_at, coupon_type, coupon_set_id, coupon_sets(coupon_sets:id,period,title)")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(200);
        } catch {
          return { data: [], error: null };
        }
      })(),
      supabase
        .from("spin_cooldowns")
        .select("next_spin_at, free_spin_granted, last_free_granted_at")
        .eq("user_id", user.id)
        .maybeSingle()
    ]);

    const balance =
      Array.isArray(balanceQ.data) && !balanceQ.error
        ? (balanceQ.data as Array<{ delta: number }>).reduce((a, b) => a + Number(b.delta || 0), 0)
        : 0;

    const referrals = !refsQ.error && Array.isArray(refsQ.data) ? (refsQ.data as Array<unknown>) : [];
    const invitees = Array.isArray(referrals)
      ? (referrals as Array<{ invited_user_id: string; created_at: string }>)
      : [];

    const inviterRow =
      !inviteesQ.error && inviteesQ.data
        ? (inviteesQ.data as unknown as {
            referrer_id: string;
            created_at: string;
            referrer?: { tg_user_id: number; username: string | null } | null;
          })
        : null;

    const spinsRaw = Array.isArray(spinsQ.data) && !spinsQ.error
      ? (spinsQ.data as unknown as Array<{
          created_at: string;
          win: boolean;
          prize_id: string | null;
          prizes: unknown;
        }>)
      : [];
    const spins = spinsRaw.map((s) => {
      const prizesArr = Array.isArray(s.prizes) ? (s.prizes as Array<{ title: string }>) : [];
      const prizesObj =
        s.prizes && typeof s.prizes === "object" && !Array.isArray(s.prizes)
          ? (s.prizes as { title?: string } | null)
          : null;
      const title = prizesArr[0]?.title ?? prizesObj?.title ?? null;
      return {
        created_at: s.created_at,
        win: !!s.win,
        prize_id: s.prize_id ?? null,
        prizes: title != null ? { title } : null
      };
    });

    const spinsTotal = spins.length;
    const winsTotal = spins.filter((s) => s.win).length;
    const lossesTotal = Math.max(0, spinsTotal - winsTotal);
    const lastSpinAt = spins[0]?.created_at ?? null;

    const coupons = Array.isArray(couponsQ.data) && !couponsQ.error
      ? (couponsQ.data as Array<{
          created_at: string;
          coupon_type: string | null;
          coupon_set_id: string | null;
          coupon_sets?: unknown;
        }>)
      : [];

    const cooldown = !cooldownQ.error && cooldownQ.data
      ? (cooldownQ.data as unknown as {
          next_spin_at: string | null;
          free_spin_granted: boolean;
          last_free_granted_at: string | null;
        })
      : null;

    return NextResponse.json({
      user,
      balance,
      cooldown: cooldown
        ? {
            next_spin_at: cooldown.next_spin_at,
            free_spin_granted: !!cooldown.free_spin_granted,
            last_free_granted_at: cooldown.last_free_granted_at ?? null
          }
        : { next_spin_at: null, free_spin_granted: false, last_free_granted_at: null },
      inviter: inviterRow?.referrer ? {
        tg_user_id: inviterRow.referrer.tg_user_id,
        username: inviterRow.referrer.username ?? null,
        invited_at: inviterRow.created_at
      } : null,
      invitees_count: invitees.length,
      spins_summary: {
        total: spinsTotal,
        wins: winsTotal,
        losses: lossesTotal,
        last_spin_at: lastSpinAt
      },
      spins_recent: spins.map((s) => ({
        created_at: s.created_at,
        win: !!s.win,
        prize_title: s.prizes?.title ?? (s.win ? "Купон" : null)
      })),
      coupons_count: coupons.length,
      coupons_recent: coupons.map((c) => ({
        created_at: c.created_at,
        coupon_type: c.coupon_type ?? "—",
        coupon_set_id: c.coupon_set_id
      })),
      ref_code: user.ref_code ?? null
    });
  } catch (e) {
    console.error("[admin/api/users/[id] GET failed]", e);
    return NextResponse.json({ error: "Не удалось загрузить пользователя" }, { status: 500 });
  }
}

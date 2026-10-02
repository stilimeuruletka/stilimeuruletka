import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { verifyAdminSession } from "../../../../../../lib/adminSession";

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

export async function POST(
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
    const { data, error } = await supabase.rpc("admin_reset_cooldown", { p_tg_user_id: tgUserId });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : (data as unknown as Record<string, unknown> | null);
    if (!row || !(row as { ok?: boolean }).ok) {
      return NextResponse.json(
        { error: (row as { msg?: string })?.msg || "Не удалось сбросить кулдаун" },
        { status: 400 }
      );
    }
    return NextResponse.json({
      ok: true,
      next_spin_at: (row as { next_spin_at?: string | null }).next_spin_at ?? null
    });
  } catch (e) {
    console.error("[admin/api/users/[id]/reset-cooldown POST failed]", e);
    return NextResponse.json({ error: "Не удалось сбросить кулдаун" }, { status: 500 });
  }
}

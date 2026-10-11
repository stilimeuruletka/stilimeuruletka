import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase env missing");
  return createClient(url, key, { auth: { persistSession: false } });
}

// Достаём tg_user_id из initData (как в других публичных роутах)
function tgUserIdFromInitData(initData: string | null): number | null {
  if (!initData) return null;
  try {
    const params = new URLSearchParams(initData);
    const userRaw = params.get("user");
    if (!userRaw) return null;
    const user = JSON.parse(userRaw) as { id?: number };
    return typeof user.id === "number" && Number.isFinite(user.id) ? user.id : null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const initData = req.headers.get("x-telegram-init-data") ?? null;
  const body = ((await req.json().catch(() => null)) as { kind?: string; ad_id?: string }) ?? {};
  const kind = body.kind === "ad" ? "ad" : "own";
  const adId = kind === "ad" && typeof body.ad_id === "string" ? body.ad_id : null;

  let supabase;
  try {
    supabase = getSupabase();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const tg_user_id = tgUserIdFromInitData(initData);

  const row: { kind: string; ad_id: string | null; tg_user_id: number | null } = {
    kind,
    ad_id: adId,
    tg_user_id
  };

  const { error } = await supabase.from("preview_views").insert(row);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
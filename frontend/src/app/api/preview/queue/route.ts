import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const DEFAULT_OWN = "/ГЛАВНОЕВИДЕО.mp4";

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env missing");
  return createClient(url, key, { auth: { persistSession: false } });
}

type AdRow = {
  id: string;
  client_name: string;
  video_url: string;
  publish_date: string;
  end_date: string;
  views: number;
};

export async function GET() {
  let supabase;
  try {
    supabase = getSupabase();
  } catch {
    return NextResponse.json({ own: DEFAULT_OWN, ad: null });
  }

  // 1) Наш ролик
  const { data: own } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "splash_video_url")
    .maybeSingle();
  const ownUrl =
    own && typeof (own as { value?: string }).value === "string"
      ? (own as { value: string }).value
      : null;
  const effectiveOwn =
    ownUrl && ownUrl.trim() ? ownUrl.trim() : DEFAULT_OWN;

  // 2) Активный рекламный ролик (если период публикации сейчас)
  const { data: ad, error } = await supabase.rpc("preview_active_ad");
  const adRow = !error && Array.isArray(ad) && ad.length > 0 ? (ad[0] as AdRow) : null;

  return NextResponse.json({
    own: effectiveOwn,
    ad: adRow
      ? {
          id: adRow.id,
          client_name: adRow.client_name,
          video_url: adRow.video_url,
          publish_date: adRow.publish_date,
          end_date: adRow.end_date,
          views: adRow.views
        }
      : null
  });
}

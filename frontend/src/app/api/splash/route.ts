import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SETTINGS_KEY = "splash_video_url";

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET() {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ splash_video_url: "/IMG_2304.MP4" });
  }

  try {
    const { data, error } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", SETTINGS_KEY)
      .maybeSingle();
    const value = error ? null : (data as { value?: string } | null)?.value;
    return NextResponse.json({ splash_video_url: value || "/IMG_2304.MP4" });
  } catch {
    return NextResponse.json({ splash_video_url: "/IMG_2304.MP4" });
  }
}
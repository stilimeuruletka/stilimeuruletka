import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getAdminSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("SUPABASE_URL is not configured");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  return createClient(url, key, { auth: { persistSession: false } });
}

function normalizePrizeInput(input: unknown) {
  if (!input || typeof input !== "object") return null;
  const obj = input as Record<string, unknown>;

  const titleRaw = obj.title;
  const weightRaw = obj.weight;
  const valueRaw = obj.value;
  const activeRaw = obj.active;

  if (typeof titleRaw !== "string") return null;
  const title = titleRaw.trim();
  if (title.length < 1 || title.length > 160) return null;

  const weight = typeof weightRaw === "number" ? weightRaw : Number(weightRaw);
  if (!Number.isFinite(weight) || !Number.isInteger(weight) || weight <= 0 || weight > 1_000_000) return null;

  let value: number | null = null;
  if (valueRaw !== null && valueRaw !== undefined && valueRaw !== "") {
    const n = typeof valueRaw === "number" ? valueRaw : Number(valueRaw);
    if (!Number.isFinite(n) || n < 0) return null;
    value = n;
  }

  const active = typeof activeRaw === "boolean" ? activeRaw : activeRaw === undefined ? true : Boolean(activeRaw);
  return { title, weight, value, active };
}

export async function GET() {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("prizes")
    .select("id,title,weight,value,active,created_at")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ prizes: data ?? [] });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as unknown;
  const normalized = normalizePrizeInput(body);
  if (!normalized) return NextResponse.json({ error: "Invalid prize data" }, { status: 400 });

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("prizes")
    .insert(normalized)
    .select("id,title,weight,value,active,created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ prize: data }, { status: 201 });
}


import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { verifyAdminSession } from "../../../../lib/adminSession";

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

function normalizePrizeInput(input: unknown) {
  if (!input || typeof input !== "object") return null;
  const obj = input as Record<string, unknown>;

  const titleRaw = obj.title;
  const weightRaw = obj.weight;
  const spinsRaw = obj.spins;
  const activeRaw = obj.active;

  if (typeof titleRaw !== "string") return null;
  const title = titleRaw.trim();
  if (title.length < 1 || title.length > 160) return null;

  const weight = typeof weightRaw === "number" ? weightRaw : Number(weightRaw);
  if (!Number.isFinite(weight) || !Number.isInteger(weight) || weight <= 0 || weight > 1_000_000) return null;

  let spins: number | null = null;
  if (spinsRaw !== null && spinsRaw !== undefined && spinsRaw !== "") {
    const n = typeof spinsRaw === "number" ? spinsRaw : Number(spinsRaw);
    if (!Number.isFinite(n) || n < 0) return null;
    spins = n;
  }

  const active = typeof activeRaw === "boolean" ? activeRaw : activeRaw === undefined ? true : Boolean(activeRaw);
  return { title, weight, spins, active };
}

export async function GET(req: Request) {
  const fail = await requireAdmin(req);
  if (fail) return fail;

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("prizes")
    .select("id,title,weight,spins,active,created_at")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ prizes: data ?? [] });
}

export async function POST(req: Request) {
  const fail = await requireAdmin(req);
  if (fail) return fail;

  const body = (await req.json().catch(() => null)) as unknown;
  const normalized = normalizePrizeInput(body);
  if (!normalized) return NextResponse.json({ error: "Invalid prize data" }, { status: 400 });

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("prizes")
    .insert(normalized)
    .select("id,title,weight,spins,active,created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ prize: data }, { status: 201 });
}


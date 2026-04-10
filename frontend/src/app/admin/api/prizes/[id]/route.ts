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

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function normalizePrizePatch(input: unknown) {
  if (!input || typeof input !== "object") return null;
  const obj = input as Record<string, unknown>;
  const patch: Record<string, unknown> = {};

  if (obj.title !== undefined) {
    if (typeof obj.title !== "string") return null;
    const title = obj.title.trim();
    if (title.length < 1 || title.length > 160) return null;
    patch.title = title;
  }

  if (obj.weight !== undefined) {
    const weight = typeof obj.weight === "number" ? obj.weight : Number(obj.weight);
    if (!Number.isFinite(weight) || !Number.isInteger(weight) || weight <= 0 || weight > 1_000_000) return null;
    patch.weight = weight;
  }

  if (obj.value !== undefined) {
    if (obj.value === null || obj.value === "") {
      patch.value = null;
    } else {
      const n = typeof obj.value === "number" ? obj.value : Number(obj.value);
      if (!Number.isFinite(n) || n < 0) return null;
      patch.value = n;
    }
  }

  if (obj.active !== undefined) {
    if (typeof obj.active !== "boolean") return null;
    patch.active = obj.active;
  }

  if (Object.keys(patch).length === 0) return null;
  return patch;
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = (await req.json().catch(() => null)) as unknown;
  const patch = normalizePrizePatch(body);
  if (!patch) return NextResponse.json({ error: "Invalid prize data" }, { status: 400 });

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("prizes")
    .update(patch)
    .eq("id", id)
    .select("id,title,weight,value,active,created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ prize: data });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const supabase = getAdminSupabase();
  const { error } = await supabase.from("prizes").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}


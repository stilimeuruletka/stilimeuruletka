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

  if (obj.spins !== undefined) {
    if (obj.spins === null || obj.spins === "") {
      patch.spins = null;
    } else {
      const n = typeof obj.spins === "number" ? obj.spins : Number(obj.spins);
      if (!Number.isFinite(n) || n < 0) return null;
      patch.spins = n;
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
  const fail = await requireAdmin(req);
  if (fail) return fail;

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
    .select("id,title,weight,spins,active,created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ prize: data });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const fail = await requireAdmin(req);
  if (fail) return fail;

  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const supabase = getAdminSupabase();
  const { error } = await supabase.from("prizes").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}


import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { signAdminSession } from "../../../../lib/adminSession";

export const runtime = "nodejs";

function getAdminSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("SUPABASE_URL is not configured");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as unknown;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const email = (body as Record<string, unknown>).email;
  const password = (body as Record<string, unknown>).password;
  if (typeof email !== "string" || typeof password !== "string") {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  const normalizedEmail = email.trim();
  const rawPassword = password.trim();
  if (!normalizedEmail.includes("@") || rawPassword.length < 6) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 400 });
  }

  const supabase = getAdminSupabase();
  const { data, error } = await supabase.rpc("admin_login", { p_email: normalizedEmail, p_password: rawPassword });
  if (error || !data || typeof data !== "object") {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const adminId = (data as Record<string, unknown>).admin_id;
  const adminEmail = (data as Record<string, unknown>).email;
  if (typeof adminId !== "string" || typeof adminEmail !== "string") {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const token = await signAdminSession({ admin_id: adminId, email: adminEmail }, 60 * 60 * 24 * 14);
  const res = NextResponse.json({ ok: true, admin: { email: adminEmail } });
  res.cookies.set("admin_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/admin",
    maxAge: 60 * 60 * 24 * 14
  });
  return res;
}

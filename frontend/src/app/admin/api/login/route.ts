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

function getCookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const [k, v] = part.split("=");
    if (!k) continue;
    if (k.trim() === name) return typeof v === "string" ? decodeURIComponent(v.trim()) : null;
  }
  return null;
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function verifyPasswordHash(password: string, hash: string): Promise<boolean> {
  const trimmed = hash.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("$2a$") || trimmed.startsWith("$2b$") || trimmed.startsWith("$2y$")) {
    return false;
  }
  const provided = await sha256Hex(password);
  const normalizedProvided = provided.toLowerCase();
  const normalizedHash = trimmed.toLowerCase();
  if (normalizedProvided === normalizedHash) return true;
  if (trimmed.length === 64 && /^[a-f0-9]+$/i.test(trimmed) && normalizedHash === normalizedProvided) return true;
  return false;
}

function issueSessionCookie(admin: { admin_id: string; email: string }) {
  const maxAge = 60 * 60 * 24 * 14;
  const tokenPromise = signAdminSession(admin, maxAge);
  return async () => {
    const token = await tokenPromise;
    const res = NextResponse.json({ ok: true, admin: { email: admin.email } });
    res.cookies.set("admin_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/admin",
      maxAge
    });
    return res;
  };
}

export async function POST(req: Request) {
  const cookieHeader = req.headers.get("cookie");
  void getCookieValue(cookieHeader, "admin_session");

  const body = (await req.json().catch(() => null)) as unknown;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const obj = body as Record<string, unknown>;
  const loginRaw = obj.login ?? obj.email;
  const password = obj.password;
  if (typeof loginRaw !== "string" || typeof password !== "string") {
    return NextResponse.json({ error: "Login and password are required" }, { status: 400 });
  }

  const login = loginRaw.trim();
  const rawPassword = password.trim();
  if (!login || rawPassword.length < 6) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 400 });
  }

  const envLogin = process.env.ADMIN_LOGIN;
  const envPassword = process.env.ADMIN_PASSWORD;
  const envPasswordHash = process.env.ADMIN_PASSWORD_HASH;

  if (typeof envLogin === "string" && envLogin.length > 0 && login === envLogin) {
    let envMatch = false;
    if (typeof envPasswordHash === "string" && envPasswordHash.length > 0) {
      envMatch = await verifyPasswordHash(rawPassword, envPasswordHash);
      if (!envMatch && envPasswordHash.length === 64 && /^[a-f0-9]+$/i.test(envPasswordHash)) {
        const provided = await sha256Hex(rawPassword);
        envMatch = provided.toLowerCase() === envPasswordHash.toLowerCase();
      }
    }
    if (!envMatch && typeof envPassword === "string" && envPassword.length >= 6) {
      envMatch = envPassword === rawPassword;
    }
    if (envMatch) {
      const builder = issueSessionCookie({ admin_id: "env_admin", email: envLogin });
      return await builder();
    }
  }

  if (!login.includes("@")) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const supabase = getAdminSupabase();
  const { data, error } = await supabase.rpc("admin_login", { p_email: login, p_password: rawPassword });
  if (error || !data || typeof data !== "object") {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const adminId = (data as Record<string, unknown>).admin_id;
  const adminEmail = (data as Record<string, unknown>).email;
  if (typeof adminId !== "string" || typeof adminEmail !== "string") {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const builder = issueSessionCookie({ admin_id: adminId, email: adminEmail });
  return await builder();
}

import { NextResponse } from "next/server";

import { verifyAdminSession } from "../../../../../lib/adminSession";

export const runtime = "nodejs";

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

export async function GET(req: Request) {
  const fail = await requireAdmin(req);
  if (fail) return fail;

  const botUsername =
    process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ||
    process.env.TELEGRAM_BOT_USERNAME ||
    "";
  const appSlug =
    process.env.NEXT_PUBLIC_TELEGRAM_APP_SLUG || process.env.TELEGRAM_APP_SLUG || "app";

  return NextResponse.json({
    bot_username: botUsername,
    app_slug: appSlug,
    example_ref_link_template: `https://t.me/${botUsername || "<BOT>"}/${appSlug}?startapp=ref_<CODE>&mode=fullscreen`,
    example_blog_link_template: `https://t.me/${botUsername || "<BOT>"}/${appSlug}?startapp=blog_<CODE>&mode=fullscreen`
  });
}

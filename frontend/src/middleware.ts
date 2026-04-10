import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { verifyAdminSession } from "./lib/adminSession";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (!pathname.startsWith("/admin")) return NextResponse.next();

  const isLoginPage = pathname === "/admin" || pathname === "/admin/";
  const isLoginApi = pathname === "/admin/api/login";
  if (isLoginPage || isLoginApi) return NextResponse.next();

  const token = req.cookies.get("admin_session")?.value ?? null;
  const session = await verifyAdminSession(token);
  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/admin";
    if (pathname !== "/admin") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"]
};


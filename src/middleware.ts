import { type NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "./lib/session";

const PROTECTED_PAGES = ["/dashboard", "/monitors", "/settings"];
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // CSRF defence in depth (cookies are also SameSite=Lax): cross-origin writes are refused.
  if (pathname.startsWith("/api/") && MUTATING.has(request.method)) {
    const origin = request.headers.get("origin");
    if (origin && new URL(origin).host !== request.headers.get("host")) {
      return NextResponse.json({ success: false, data: null, error: "Cross-origin request refused" }, { status: 403 });
    }
  }

  if (PROTECTED_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    const userId = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
    if (!userId) {
      const login = new URL("/login", request.url);
      login.searchParams.set("next", pathname + request.nextUrl.search);
      return NextResponse.redirect(login);
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/monitors/:path*", "/settings/:path*", "/api/:path*"],
};

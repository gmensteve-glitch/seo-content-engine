// Dashboard auth gate. When DASHBOARD_TOKEN is set (production), every route
// requires the auth cookie; without it, requests are redirected to /login.
// When DASHBOARD_TOKEN is unset (local dev), the gate is disabled so
// `npm run dev` stays zero-friction.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Paths that must stay reachable without the dashboard cookie.
const PUBLIC_PREFIXES = ["/login", "/api/auth", "/api/inngest"];

export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const token = process.env.DASHBOARD_TOKEN;
  if (!token) return NextResponse.next(); // auth disabled (dev)

  if (req.cookies.get("dash_auth")?.value === token) {
    return NextResponse.next();
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // Run on everything except Next internals and static image assets.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|ico|webp)$).*)",
  ],
};

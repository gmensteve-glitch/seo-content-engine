// Password login. Compares the submitted password to DASHBOARD_PASSWORD and, on
// success, sets the HttpOnly auth cookie (value = DASHBOARD_TOKEN) the middleware
// checks. Both are server-only secrets, never exposed to the client.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const origin = new URL(req.url).origin;
  const form = await req.formData().catch(() => null);
  const password = String(form?.get("password") ?? "");

  const expected = process.env.DASHBOARD_PASSWORD;
  const token = process.env.DASHBOARD_TOKEN;

  // Auth not configured — nothing to log into; send to the dashboard.
  if (!expected || !token) {
    return NextResponse.redirect(new URL("/", origin), 303);
  }

  if (password !== expected) {
    return NextResponse.redirect(new URL("/login?error=1", origin), 303);
  }

  const res = NextResponse.redirect(new URL("/", origin), 303);
  res.cookies.set("dash_auth", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
}

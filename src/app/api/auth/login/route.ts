// Password login. DASHBOARD_PASSWORD may hold ONE password or a comma-separated
// LIST (so extra people — e.g. an SEO consultant — get their own credential that
// can be revoked independently). Any match sets the HttpOnly auth cookie (value =
// DASHBOARD_TOKEN) the middleware checks. Both are server-only secrets, never
// exposed to the client. Note: all passwords grant the same shared access level.
//
// Redirects use a RELATIVE Location so they resolve against the public URL the
// browser used — behind a proxy, req.url's host is the internal container host.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function redirect(path: string, cookie?: { name: string; value: string; maxAge: number }): NextResponse {
  const res = new NextResponse(null, { status: 303, headers: { Location: path } });
  if (cookie) {
    res.cookies.set(cookie.name, cookie.value, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: cookie.maxAge,
    });
  }
  return res;
}

export async function POST(req: Request): Promise<Response> {
  const form = await req.formData().catch(() => null);
  const password = String(form?.get("password") ?? "");

  const raw = process.env.DASHBOARD_PASSWORD;
  const token = process.env.DASHBOARD_TOKEN;

  // Auth not configured — nothing to log into; send to the dashboard.
  if (!raw || !token) return redirect("/");

  // Accept any password in the comma-separated list.
  const allowed = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (!allowed.includes(password)) return redirect("/login?error=1");

  return redirect("/", { name: "dash_auth", value: token, maxAge: 60 * 60 * 24 * 30 });
}

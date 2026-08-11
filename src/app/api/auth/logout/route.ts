// Sign out — clears the dashboard auth cookie.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const origin = new URL(req.url).origin;
  const res = NextResponse.redirect(new URL("/login", origin), 303);
  res.cookies.set("dash_auth", "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}

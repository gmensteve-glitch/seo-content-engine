// Sign out — clears the dashboard auth cookie. Relative redirect so it resolves
// against the public URL behind a proxy.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  const res = new NextResponse(null, { status: 303, headers: { Location: "/login" } });
  res.cookies.set("dash_auth", "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}

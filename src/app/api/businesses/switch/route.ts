// Switch the active store: validate the id, set the active-business cookie.
// The client reloads afterward so every server component re-scopes to it.
import { NextResponse } from "next/server";
import { prisma, hasDatabase } from "@/lib/db";
import { ACTIVE_BIZ_COOKIE } from "@/lib/active-business";

export const dynamic = "force-dynamic";

const YEAR = 60 * 60 * 24 * 365;

export async function POST(req: Request): Promise<Response> {
  const { businessId } = (await req.json().catch(() => ({}))) as { businessId?: string };
  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });
  if (hasDatabase) {
    const exists = await prisma.business
      .findUnique({ where: { id: businessId }, select: { id: true } })
      .catch(() => null);
    if (!exists) return NextResponse.json({ error: "unknown business" }, { status: 404 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ACTIVE_BIZ_COOKIE, businessId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: YEAR,
  });
  return res;
}

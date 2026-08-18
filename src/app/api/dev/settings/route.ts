// Dev-only business settings update — quality threshold, cadence, links/page,
// status. Lets us tune a business without direct DB access. Disabled in prod
// unless ENABLE_DEV_ROUTES is set.

import { NextResponse } from "next/server";
import { prisma, hasDatabase } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

function disabled(): boolean {
  return process.env.NODE_ENV === "production" && !process.env.ENABLE_DEV_ROUTES;
}

export async function POST(req: Request): Promise<Response> {
  if (disabled()) return NextResponse.json({ error: "dev routes disabled" }, { status: 403 });
  if (!hasDatabase) return NextResponse.json({ error: "no DATABASE_URL" }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as {
    businessId?: string;
    qualityThreshold?: number;
    linksPerPage?: number;
    cadencePerWeek?: number;
    status?: "ONBOARDING" | "ACTIVE" | "PAUSED";
  };
  if (!body.businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });

  const data: Prisma.BusinessUpdateInput = {};
  if (typeof body.qualityThreshold === "number")
    data.qualityThreshold = Math.max(0, Math.min(100, Math.round(body.qualityThreshold)));
  if (typeof body.linksPerPage === "number") data.linksPerPage = body.linksPerPage;
  if (typeof body.cadencePerWeek === "number") data.cadencePerWeek = body.cadencePerWeek;
  if (body.status) data.status = body.status;

  const b = await prisma.business.update({ where: { id: body.businessId }, data });
  return NextResponse.json({
    ok: true,
    id: b.id,
    qualityThreshold: b.qualityThreshold,
    cadencePerWeek: b.cadencePerWeek,
    linksPerPage: b.linksPerPage,
    status: b.status,
  });
}

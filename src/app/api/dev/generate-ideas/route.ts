// Dev-only idea generator. Runs the ideation agent for a business and inserts
// the fresh, non-duplicate ideas as PROPOSED. Disabled in production unless
// ENABLE_DEV_ROUTES is set.

import { NextResponse } from "next/server";
import { prisma, hasDatabase } from "@/lib/db";
import { generateIdeas } from "@/lib/pipeline/service";

export const dynamic = "force-dynamic";

function disabled(): boolean {
  return process.env.NODE_ENV === "production" && !process.env.ENABLE_DEV_ROUTES;
}

export async function POST(req: Request): Promise<Response> {
  if (disabled()) return NextResponse.json({ error: "dev routes disabled" }, { status: 403 });
  if (!hasDatabase) return NextResponse.json({ error: "no DATABASE_URL" }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as { businessId?: string; count?: number };
  const businessId =
    body.businessId ??
    (await prisma.business.findFirst({ orderBy: { createdAt: "asc" } }))?.id;
  if (!businessId) return NextResponse.json({ error: "no business found" }, { status: 400 });

  const added = await generateIdeas(businessId, body.count ?? 6);
  const ideas = await prisma.idea.findMany({
    where: { businessId, status: "PROPOSED" },
    orderBy: { score: "desc" },
    take: 20,
    select: { id: true, title: true, score: true },
  });
  return NextResponse.json({ businessId, added, proposed: ideas });
}

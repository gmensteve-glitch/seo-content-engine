// Dev-only research runner. Builds a real gap-map brief from an idea (live SERP
// via DataForSEO + competitor scraping via Firecrawl + Claude synthesis) and
// returns it. Disabled in production unless ENABLE_DEV_ROUTES is set.

import { NextResponse } from "next/server";
import { prisma, hasDatabase } from "@/lib/db";
import { buildBriefFromIdea } from "@/lib/pipeline/service";

export const dynamic = "force-dynamic";

function disabled(): boolean {
  return process.env.NODE_ENV === "production" && !process.env.ENABLE_DEV_ROUTES;
}

export async function POST(req: Request): Promise<Response> {
  if (disabled()) return NextResponse.json({ error: "dev routes disabled" }, { status: 403 });
  if (!hasDatabase) return NextResponse.json({ error: "no DATABASE_URL" }, { status: 400 });

  const { ideaId } = (await req.json().catch(() => ({}))) as { ideaId?: string };
  if (!ideaId) return NextResponse.json({ error: "ideaId required" }, { status: 400 });

  const briefId = await buildBriefFromIdea(ideaId);
  const brief = await prisma.brief.findUnique({
    where: { id: briefId },
    include: { idea: true },
  });

  return NextResponse.json({
    briefId,
    title: brief?.idea.title,
    targetKeyword: brief?.targetKeyword,
    angle: brief?.angle,
    gap: brief?.gapMap,
    wordTarget: brief?.wordTarget,
    outline: brief?.outline,
    questions: brief?.questions,
    requiredSchema: brief?.requiredSchema,
  });
}

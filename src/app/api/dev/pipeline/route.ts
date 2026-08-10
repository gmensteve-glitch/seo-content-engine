// Dev-only pipeline runner. Lets you drive an idea through the whole lifecycle
// (build brief → approve → write → grade → publish) with a single request while
// developing. Disabled in production unless ENABLE_DEV_ROUTES is set.

import { NextResponse } from "next/server";
import { prisma, hasDatabase } from "@/lib/db";
import { buildBriefFromIdea, approveBrief } from "@/lib/pipeline/service";

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
  await approveBrief(briefId);

  const brief = await prisma.brief.findUnique({
    where: { id: briefId },
    include: { draft: { include: { grades: { orderBy: { version: "asc" } }, page: true } } },
  });

  return NextResponse.json({
    ideaId,
    briefId,
    briefStatus: brief?.status,
    draft: brief?.draft && {
      id: brief.draft.id,
      title: brief.draft.title,
      status: brief.draft.status,
      version: brief.draft.version,
      grades: brief.draft.grades.map((g) => ({ version: g.version, overall: g.overall, passed: g.passed })),
      page: brief.draft.page && { url: brief.draft.page.url, cmsId: brief.draft.page.cmsId },
    },
  });
}

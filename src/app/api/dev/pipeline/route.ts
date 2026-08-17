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

  const body = (await req.json().catch(() => ({}))) as { ideaId?: string; businessId?: string };
  let ideaId = body.ideaId;

  // Convenience for smoke-testing: with no ideaId, auto-pick the top-scored
  // PROPOSED idea (optionally scoped to a business).
  if (!ideaId) {
    const top = await prisma.idea.findFirst({
      where: { status: "PROPOSED", ...(body.businessId ? { businessId: body.businessId } : {}) },
      orderBy: { score: "desc" },
    });
    if (!top) return NextResponse.json({ error: "no PROPOSED idea found" }, { status: 400 });
    ideaId = top.id;
  }

  // Build the brief, then approve → this QUEUES the pipeline (returns fast). The
  // background worker runs research/write/grade out of band; poll /api/dev/status
  // (or the Pipeline board) to watch it progress — no request timeout.
  const briefId = await buildBriefFromIdea(ideaId);
  await approveBrief(briefId);

  const brief = await prisma.brief.findUnique({
    where: { id: briefId },
    include: { idea: true, draft: true },
  });

  return NextResponse.json({
    queued: true,
    ideaId,
    ideaTitle: brief?.idea.title,
    briefId,
    briefStatus: brief?.status,
    brief: brief && {
      targetKeyword: brief.targetKeyword,
      angle: brief.angle,
      wordTarget: brief.wordTarget,
    },
    draftId: brief?.draft?.id,
    draftStatus: brief?.draft?.status,
    note: "Pipeline queued — poll GET /api/dev/status to watch it write → grade → PASSED/FAILED.",
  });
}

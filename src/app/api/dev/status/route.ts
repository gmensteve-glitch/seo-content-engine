// Dev-only status probe — a quick read-only snapshot of the DB state for
// testing (counts by stage + the most recent draft and its latest grade).
// Disabled in production unless ENABLE_DEV_ROUTES is set.

import { NextResponse } from "next/server";
import { prisma, hasDatabase } from "@/lib/db";

export const dynamic = "force-dynamic";

function disabled(): boolean {
  return process.env.NODE_ENV === "production" && !process.env.ENABLE_DEV_ROUTES;
}

export async function GET(req: Request): Promise<Response> {
  if (disabled()) return NextResponse.json({ error: "dev routes disabled" }, { status: 403 });
  if (!hasDatabase) return NextResponse.json({ error: "no DATABASE_URL" }, { status: 400 });

  const url = new URL(req.url);
  const businessId = url.searchParams.get("businessId") ?? undefined;
  const where = businessId ? { businessId } : {};

  const [ideasByStatus, briefsByStatus, draftsByStatus, latest] = await Promise.all([
    prisma.idea.groupBy({ by: ["status"], where, _count: true }),
    prisma.brief.groupBy({ by: ["status"], where, _count: true }),
    prisma.draft.groupBy({ by: ["status"], where, _count: true }),
    prisma.draft.findFirst({
      where,
      orderBy: { updatedAt: "desc" },
      include: { grades: { orderBy: { version: "asc" } } },
    }),
  ]);

  const count = (rows: { status: string; _count: number }[]) =>
    Object.fromEntries(rows.map((r) => [r.status, r._count]));

  return NextResponse.json({
    ideas: count(ideasByStatus as never),
    briefs: count(briefsByStatus as never),
    drafts: count(draftsByStatus as never),
    latestDraft: latest && {
      title: latest.title,
      status: latest.status,
      version: latest.version,
      wordCount: latest.bodyMd.trim().split(/\s+/).filter(Boolean).length,
      scheduledFor: latest.scheduledFor,
      grades: latest.grades.map((g) => ({ version: g.version, overall: g.overall, passed: g.passed })),
      latestDimensions: latest.grades[latest.grades.length - 1]?.dimensions ?? null,
      latestFeedback: latest.grades[latest.grades.length - 1]?.feedback ?? null,
      updatedAt: latest.updatedAt,
    },
  });
}

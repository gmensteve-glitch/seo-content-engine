// Dev-only data export — a full snapshot of the content the system holds
// (businesses → ideas, briefs, drafts + grades + bodies, published pages).
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
  const where = businessId ? { id: businessId } : {};

  const businesses = await prisma.business.findMany({
    where,
    include: {
      pillars: true,
      ideas: { orderBy: { createdAt: "desc" } },
      briefs: { include: { idea: true }, orderBy: { createdAt: "desc" } },
      drafts: {
        orderBy: { updatedAt: "desc" },
        include: {
          brief: true,
          grades: { orderBy: { version: "asc" } },
          page: true,
        },
      },
      pages: { orderBy: { publishedAt: "desc" } },
    },
  });

  return NextResponse.json({
    exportedFrom: url.host,
    businesses: businesses.map((b) => ({
      id: b.id,
      name: b.name,
      domain: b.domain,
      pillars: b.pillars.map((p) => p.name),
      ideas: b.ideas.map((i) => ({ title: i.title, score: i.score, status: i.status, createdAt: i.createdAt })),
      briefs: b.briefs.map((br) => ({
        title: br.idea.title,
        targetKeyword: br.targetKeyword,
        angle: br.angle,
        wordTarget: br.wordTarget,
        status: br.status,
        createdAt: br.createdAt,
      })),
      drafts: b.drafts.map((d) => ({
        id: d.id,
        title: d.title,
        status: d.status,
        wordCount: d.bodyMd.trim().split(/\s+/).filter(Boolean).length,
        targetKeyword: d.brief.targetKeyword,
        scheduledFor: d.scheduledFor,
        reviewedAt: d.reviewedAt,
        grades: d.grades.map((g) => ({ version: g.version, overall: g.overall, passed: g.passed, dimensions: g.dimensions, feedback: g.feedback })),
        page: d.page ? { url: d.page.url, cmsId: d.page.cmsId, publishedAt: d.page.publishedAt } : null,
        bodyMd: d.bodyMd,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      })),
      pages: b.pages.map((p) => ({ url: p.url, cmsId: p.cmsId, publishedAt: p.publishedAt })),
    })),
  });
}

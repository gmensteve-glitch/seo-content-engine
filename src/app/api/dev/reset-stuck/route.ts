// Dev-only maintenance: clear drafts stranded in an in-progress state (e.g. old
// test artifacts from before the background worker existed) by marking them
// FAILED and releasing any lock. The worker heals crashes on its own; this is
// just a manual broom for a clean slate. Disabled in prod unless ENABLE_DEV_ROUTES.

import { NextResponse } from "next/server";
import { prisma, hasDatabase } from "@/lib/db";

export const dynamic = "force-dynamic";

function disabled(): boolean {
  return process.env.NODE_ENV === "production" && !process.env.ENABLE_DEV_ROUTES;
}

export async function POST(): Promise<Response> {
  if (disabled()) return NextResponse.json({ error: "dev routes disabled" }, { status: 403 });
  if (!hasDatabase) return NextResponse.json({ error: "no DATABASE_URL" }, { status: 400 });

  const res = await prisma.draft.updateMany({
    where: { status: { in: ["RESEARCHING", "DRAFTED", "GRADING", "REVISING"] } },
    data: { status: "FAILED", processingStartedAt: null },
  });
  return NextResponse.json({ cleared: res.count });
}

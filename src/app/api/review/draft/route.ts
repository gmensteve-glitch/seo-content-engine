// Poll a draft's current review state (used while a background boost runs).
// Returns the draft view-model + whether a boost is still in progress.

import { NextResponse } from "next/server";
import { prisma, hasDatabase } from "@/lib/db";
import { getPolishDraft } from "@/lib/data/repo";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  if (!hasDatabase) return NextResponse.json({ error: "no DATABASE_URL" }, { status: 400 });
  const draftId = new URL(req.url).searchParams.get("draftId");
  if (!draftId) return NextResponse.json({ error: "draftId required" }, { status: 400 });

  const [draft, row] = await Promise.all([
    getPolishDraft(draftId),
    prisma.draft.findUnique({ where: { id: draftId }, select: { boostRequestedAt: true } }),
  ]);
  return NextResponse.json({ draft, boosting: Boolean(row?.boostRequestedAt) });
}

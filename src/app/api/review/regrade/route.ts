// Re-grade a draft after edits. Auth-gated by middleware. Returns the updated
// draft (PASSED drafts leave the review lane and flow to the calendar).

import { NextResponse } from "next/server";
import { hasDatabase } from "@/lib/db";
import { regradeDraft } from "@/lib/pipeline/service";
import { getPolishDraft } from "@/lib/data/repo";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  if (!hasDatabase) return NextResponse.json({ error: "no DATABASE_URL" }, { status: 400 });
  const { draftId } = (await req.json().catch(() => ({}))) as { draftId?: string };
  if (!draftId) return NextResponse.json({ error: "draftId required" }, { status: 400 });

  const result = await regradeDraft(draftId);
  const draft = await getPolishDraft(draftId);
  return NextResponse.json({ result, draft });
}

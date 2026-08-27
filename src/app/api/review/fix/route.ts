// Apply operator feedback to a blog: fix THIS blog now per the note, and store
// the note as a house rule so every future blog follows it. Returns the updated
// draft view-model so the review page re-renders with the corrected content.

import { NextResponse } from "next/server";
import { hasDatabase } from "@/lib/db";
import { applyBlogFeedback } from "@/lib/pipeline/service";
import { getPolishDraft } from "@/lib/data/repo";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  if (!hasDatabase) return NextResponse.json({ error: "no DATABASE_URL" }, { status: 400 });
  const { draftId, note } = (await req.json().catch(() => ({}))) as {
    draftId?: string;
    note?: string;
  };
  if (!draftId) return NextResponse.json({ error: "draftId required" }, { status: 400 });
  if (!note || !note.trim()) return NextResponse.json({ error: "note required" }, { status: 400 });

  try {
    const result = await applyBlogFeedback(draftId, note);
    const draft = await getPolishDraft(draftId);
    return NextResponse.json({ ...result, draft });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "failed to apply feedback" },
      { status: 500 },
    );
  }
}

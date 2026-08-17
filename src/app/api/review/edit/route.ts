// Highlight → instruct: revise the selected passage per a short instruction.
// Auth-gated by middleware (dashboard cookie). Returns the updated draft.

import { NextResponse } from "next/server";
import { hasDatabase } from "@/lib/db";
import { editDraftSelection } from "@/lib/pipeline/service";
import { getPolishDraft } from "@/lib/data/repo";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  if (!hasDatabase) return NextResponse.json({ error: "no DATABASE_URL" }, { status: 400 });
  const { draftId, selectedText, instruction } = (await req.json().catch(() => ({}))) as {
    draftId?: string;
    selectedText?: string;
    instruction?: string;
  };
  if (!draftId || !selectedText || !instruction) {
    return NextResponse.json({ error: "draftId, selectedText, instruction required" }, { status: 400 });
  }
  await editDraftSelection(draftId, selectedText, instruction);
  const draft = await getPolishDraft(draftId);
  return NextResponse.json({ draft });
}

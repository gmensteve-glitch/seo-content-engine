// Auto-boost a near-miss with our own resources (product + web data), then
// re-grade. No human writing. Auth-gated by middleware. Returns the result +
// updated draft (which may now be PASSED and gone from the review lane).

import { NextResponse } from "next/server";
import { hasDatabase } from "@/lib/db";
import { boostDraft } from "@/lib/pipeline/service";
import { getPolishDraft } from "@/lib/data/repo";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  if (!hasDatabase) return NextResponse.json({ error: "no DATABASE_URL" }, { status: 400 });
  const { draftId } = (await req.json().catch(() => ({}))) as { draftId?: string };
  if (!draftId) return NextResponse.json({ error: "draftId required" }, { status: 400 });

  const result = await boostDraft(draftId);
  const draft = await getPolishDraft(draftId);
  return NextResponse.json({ result, draft });
}

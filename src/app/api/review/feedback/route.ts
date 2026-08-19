// Record operator feedback on a finished piece: "I like it because…" (LIKE) or
// "Reject & why…" (REJECT). REJECT also drops the piece from the Ready list.
// Auth-gated by middleware.

import { NextResponse } from "next/server";
import { hasDatabase } from "@/lib/db";
import { recordDraftFeedback } from "@/lib/pipeline/service";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  if (!hasDatabase) return NextResponse.json({ error: "no DATABASE_URL" }, { status: 400 });
  const { draftId, verdict, reason } = (await req.json().catch(() => ({}))) as {
    draftId?: string;
    verdict?: "LIKE" | "REJECT";
    reason?: string;
  };
  if (!draftId) return NextResponse.json({ error: "draftId required" }, { status: 400 });
  if (verdict !== "LIKE" && verdict !== "REJECT") {
    return NextResponse.json({ error: "verdict must be LIKE or REJECT" }, { status: 400 });
  }
  if (!reason || !reason.trim()) {
    return NextResponse.json({ error: "reason required" }, { status: 400 });
  }
  await recordDraftFeedback(draftId, verdict, reason);
  return NextResponse.json({ ok: true, verdict });
}

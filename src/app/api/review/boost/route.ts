// Request an auto-boost (product + web data) for a near-miss. Returns FAST — the
// heavy work (research + enrich + re-grade) runs in the background so the button
// never times out. Poll GET /api/review/draft?draftId=… for completion.

import { NextResponse } from "next/server";
import { hasDatabase } from "@/lib/db";
import { requestBoost, processBoostRequests } from "@/lib/pipeline/service";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  if (!hasDatabase) return NextResponse.json({ error: "no DATABASE_URL" }, { status: 400 });
  const { draftId } = (await req.json().catch(() => ({}))) as { draftId?: string };
  if (!draftId) return NextResponse.json({ error: "draftId required" }, { status: 400 });

  await requestBoost(draftId);
  // Kick the background worker without blocking; the periodic tick is the backstop.
  void processBoostRequests().catch((e) =>
    console.error("[boost] kick failed:", e instanceof Error ? e.message : e),
  );
  return NextResponse.json({ started: true });
}

// Move a reviewed piece from "Ready" into the calendar's ready-to-schedule
// queue (no date yet — that's picked on the calendar). Auth-gated by middleware.

import { NextResponse } from "next/server";
import { hasDatabase } from "@/lib/db";
import { markReadyForSchedule } from "@/lib/pipeline/service";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  if (!hasDatabase) return NextResponse.json({ error: "no DATABASE_URL" }, { status: 400 });
  const { draftId } = (await req.json().catch(() => ({}))) as { draftId?: string };
  if (!draftId) return NextResponse.json({ error: "draftId required" }, { status: 400 });

  await markReadyForSchedule(draftId);
  return NextResponse.json({ ok: true });
}

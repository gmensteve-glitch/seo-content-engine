// Schedule a ready (PASSED) draft for auto-publish, from the review view.
// Auth-gated by middleware. Returns the scheduled time.

import { NextResponse } from "next/server";
import { hasDatabase } from "@/lib/db";
import { scheduleDraft } from "@/lib/pipeline/service";

export const dynamic = "force-dynamic";

/** Interpret a picker value as UTC (matches scheduleDraftAction). */
function parseWhen(when: string): Date | null {
  let iso = when;
  if (/^\d{4}-\d{2}-\d{2}$/.test(when)) iso = `${when}T14:00:00.000Z`;
  else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(when)) iso = `${when}:00.000Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function POST(req: Request): Promise<Response> {
  if (!hasDatabase) return NextResponse.json({ error: "no DATABASE_URL" }, { status: 400 });
  const { draftId, scheduledFor } = (await req.json().catch(() => ({}))) as {
    draftId?: string;
    scheduledFor?: string;
  };
  if (!draftId || !scheduledFor) {
    return NextResponse.json({ error: "draftId, scheduledFor required" }, { status: 400 });
  }
  const when = parseWhen(scheduledFor);
  if (!when) return NextResponse.json({ error: "invalid date" }, { status: 400 });

  await scheduleDraft(draftId, when);
  return NextResponse.json({ ok: true, scheduledFor: when.toISOString() });
}

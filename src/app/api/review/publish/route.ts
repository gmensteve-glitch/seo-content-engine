// Publish a ready draft immediately from the review view (bypass the calendar).
// Auth-gated by middleware. Returns the live URL.

import { NextResponse } from "next/server";
import { hasDatabase } from "@/lib/db";
import { publishNow } from "@/lib/pipeline/service";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  if (!hasDatabase) return NextResponse.json({ error: "no DATABASE_URL" }, { status: 400 });
  const { draftId } = (await req.json().catch(() => ({}))) as { draftId?: string };
  if (!draftId) return NextResponse.json({ error: "draftId required" }, { status: 400 });

  const url = await publishNow(draftId, "published");
  return NextResponse.json({ ok: true, url });
}

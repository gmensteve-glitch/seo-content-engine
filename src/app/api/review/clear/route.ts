// Clear pieces off the Ready list once they've been downloaded or published by
// hand: the given draftIds, or the whole list when none are sent. Uses the
// active store. Auth-gated by middleware.

import { NextResponse } from "next/server";
import { hasDatabase } from "@/lib/db";
import { getBusiness } from "@/lib/data/repo";
import { clearReadyDrafts } from "@/lib/pipeline/service";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  if (!hasDatabase) return NextResponse.json({ error: "no DATABASE_URL" }, { status: 400 });
  const { draftIds } = (await req.json().catch(() => ({}))) as { draftIds?: string[] };
  try {
    const biz = await getBusiness();
    const cleared = await clearReadyDrafts(biz.id, draftIds?.length ? draftIds : undefined);
    return NextResponse.json({ ok: true, cleared });
  } catch (e) {
    const error = e instanceof Error ? e.message : "Clear failed";
    console.error("[clear] failed:", error);
    return NextResponse.json({ error }, { status: 500 });
  }
}

// Return the exact HTML a draft would publish as, plus the pre-publish check
// result — powers the "Preview final post" pane. Auth-gated by middleware.

import { NextResponse } from "next/server";
import { hasDatabase } from "@/lib/db";
import { renderPublishPreview } from "@/lib/pipeline/service";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  if (!hasDatabase) return NextResponse.json({ error: "no DATABASE_URL" }, { status: 400 });
  const draftId = new URL(req.url).searchParams.get("draftId");
  if (!draftId) return NextResponse.json({ error: "draftId required" }, { status: 400 });
  try {
    const preview = await renderPublishPreview(draftId);
    return NextResponse.json(preview);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "preview failed" },
      { status: 400 },
    );
  }
}

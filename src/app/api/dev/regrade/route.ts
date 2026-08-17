// Dev-only: re-grade a draft (the polish-lane last mile) and report the result.
// Optionally overwrite the body first (simulating a human edit). Disabled in
// production unless ENABLE_DEV_ROUTES is set.

import { NextResponse } from "next/server";
import { hasDatabase } from "@/lib/db";
import { updateDraftBody, regradeDraft } from "@/lib/pipeline/service";

export const dynamic = "force-dynamic";

function disabled(): boolean {
  return process.env.NODE_ENV === "production" && !process.env.ENABLE_DEV_ROUTES;
}

export async function POST(req: Request): Promise<Response> {
  if (disabled()) return NextResponse.json({ error: "dev routes disabled" }, { status: 403 });
  if (!hasDatabase) return NextResponse.json({ error: "no DATABASE_URL" }, { status: 400 });

  const { draftId, bodyMd } = (await req.json().catch(() => ({}))) as {
    draftId?: string;
    bodyMd?: string;
  };
  if (!draftId) return NextResponse.json({ error: "draftId required" }, { status: 400 });

  if (bodyMd?.trim()) await updateDraftBody(draftId, bodyMd);
  const result = await regradeDraft(draftId);
  return NextResponse.json({ draftId, ...result });
}

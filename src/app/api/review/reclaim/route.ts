// "Free up disk space": purge stored images of finished drafts and compact the
// tables (see reclaimImageStorage). Operator-triggered only. Auth-gated by
// middleware.

import { NextResponse } from "next/server";
import { hasDatabase } from "@/lib/db";
import { reclaimImageStorage } from "@/lib/pipeline/service";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(): Promise<Response> {
  if (!hasDatabase) return NextResponse.json({ error: "no DATABASE_URL" }, { status: 400 });
  try {
    const res = await reclaimImageStorage();
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    const error = e instanceof Error ? e.message : "Free up disk space failed";
    console.error("[storage] reclaim failed:", error);
    return NextResponse.json({ error }, { status: 500 });
  }
}

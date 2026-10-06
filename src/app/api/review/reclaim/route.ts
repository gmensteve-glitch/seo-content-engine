// "Free up disk space": purge stored images of finished drafts and compact the
// tables (see reclaimImageStorage). Operator-triggered only. Auth-gated by
// middleware.

import { NextResponse } from "next/server";
import { hasDatabase } from "@/lib/db";
import { emptyImageGallery, reclaimImageStorage } from "@/lib/pipeline/service";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Body { emergency: true } empties the whole image gallery instead (works on a
// 100% full volume; see emptyImageGallery). A normal run that fails because
// the disk is full answers { diskFull: true } so the page can offer it.
export async function POST(req: Request): Promise<Response> {
  if (!hasDatabase) return NextResponse.json({ error: "no DATABASE_URL" }, { status: 400 });
  const { emergency } = (await req.json().catch(() => ({}))) as { emergency?: boolean };
  try {
    if (emergency) {
      const res = await emptyImageGallery();
      return NextResponse.json({ ok: true, emergency: true, ...res });
    }
    const res = await reclaimImageStorage();
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    const error = e instanceof Error ? e.message : "Free up disk space failed";
    console.error("[storage] reclaim failed:", error);
    const diskFull = /53100|No space left on device/i.test(error);
    return NextResponse.json({ error, diskFull }, { status: 500 });
  }
}

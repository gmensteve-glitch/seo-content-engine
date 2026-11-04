// The blog's hero image as a WebP download: 1200px wide, under 200 KB.
// Auth-gated by middleware.

import { NextResponse } from "next/server";
import { hasDatabase } from "@/lib/db";
import { heroWebp } from "@/lib/pipeline/copy-package";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  if (!hasDatabase) return NextResponse.json({ error: "no DATABASE_URL" }, { status: 400 });
  const draftId = new URL(req.url).searchParams.get("draftId");
  if (!draftId) return NextResponse.json({ error: "draftId required" }, { status: 400 });
  try {
    const img = await heroWebp(draftId);
    if (!img) return NextResponse.json({ error: "This blog has no hero image." }, { status: 404 });
    return new Response(new Uint8Array(img.bytes), {
      headers: {
        "Content-Type": "image/webp",
        "Content-Length": String(img.bytes.length),
        "Content-Disposition": `attachment; filename="${img.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const error = e instanceof Error ? e.message : "Couldn't make the WebP image";
    console.error("[hero-webp] failed:", error);
    return NextResponse.json({ error }, { status: 500 });
  }
}

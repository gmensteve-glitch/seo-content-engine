// The copy package for one blog (manual publishing): body HTML, the two guide
// lists, SEO title, meta description, byline choices, optional schema.
// ?refreshSeo=1 rewrites the SEO title + meta description. Auth-gated by middleware.

import { NextResponse } from "next/server";
import { hasDatabase } from "@/lib/db";
import { buildCopyPackage } from "@/lib/pipeline/copy-package";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  if (!hasDatabase) return NextResponse.json({ error: "no DATABASE_URL" }, { status: 400 });
  const url = new URL(req.url);
  const draftId = url.searchParams.get("draftId");
  if (!draftId) return NextResponse.json({ error: "draftId required" }, { status: 400 });
  try {
    const pkg = await buildCopyPackage(draftId, { refreshSeo: url.searchParams.get("refreshSeo") === "1" });
    return NextResponse.json(pkg);
  } catch (e) {
    const error = e instanceof Error ? e.message : "Couldn't build the copy package";
    console.error("[copy-package] failed:", error);
    return NextResponse.json({ error }, { status: 500 });
  }
}

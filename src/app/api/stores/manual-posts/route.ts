// "No Shopify connection" mode: the titles of blog posts already on the active
// store, one per line (empty = the store has no posts yet). Used as the
// store's live-post list for idea generation and the duplicate check.
// Auth-gated by middleware.

import { NextResponse } from "next/server";
import { hasDatabase } from "@/lib/db";
import { getBusiness } from "@/lib/data/repo";
import { forgetLivePosts } from "@/lib/pipeline/live-posts";
import { saveManualPosts } from "@/lib/catalog/manual-catalog";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  if (!hasDatabase) return NextResponse.json({ error: "no DATABASE_URL" }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as { text?: string };
  const titles = String(body.text ?? "")
    .split(/\r?\n/)
    .map((t) => t.replace(/^\s*[-*•\d.)]+\s*/, "").trim())
    .filter(Boolean);
  const biz = await getBusiness();
  await saveManualPosts(biz.id, titles);
  forgetLivePosts(biz.id);
  return NextResponse.json({ ok: true, titles: titles.length });
}

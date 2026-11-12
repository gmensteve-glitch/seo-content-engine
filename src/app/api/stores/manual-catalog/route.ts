// "No Shopify connection" mode: upload/paste the active store's product list
// (JSON or CSV, see src/lib/catalog/manual-catalog.ts for the format).
// POST {text, preview?} parses (and saves unless preview); DELETE removes it.
// Auth-gated by middleware.

import { NextResponse } from "next/server";
import { hasDatabase } from "@/lib/db";
import { getBusiness } from "@/lib/data/repo";
import { forgetLivePosts } from "@/lib/pipeline/live-posts";
import { clearManualCatalog, manualCollections, parseCatalog, saveManualCatalog } from "@/lib/catalog/manual-catalog";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  if (!hasDatabase) return NextResponse.json({ error: "no DATABASE_URL" }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as { text?: string; preview?: boolean };
  const text = String(body.text ?? "");
  if (text.length > 2_000_000) return NextResponse.json({ error: "That file is too big (2 MB max)." }, { status: 400 });
  const parsed = parseCatalog(text);
  const summary = {
    products: parsed.products.length,
    collections: manualCollections(parsed.products).map((c) => ({ title: c.title, handle: c.handle, products: c.products_count })),
    errors: parsed.errors.slice(0, 30),
    warnings: parsed.warnings.slice(0, 30),
    sample: parsed.products.slice(0, 3),
  };
  if (!parsed.products.length) return NextResponse.json({ ok: false, ...summary }, { status: 400 });
  if (body.preview) return NextResponse.json({ ok: true, saved: false, ...summary });
  const biz = await getBusiness();
  await saveManualCatalog(biz.id, parsed.products);
  forgetLivePosts(biz.id);
  return NextResponse.json({ ok: true, saved: true, ...summary });
}

export async function DELETE(): Promise<Response> {
  if (!hasDatabase) return NextResponse.json({ error: "no DATABASE_URL" }, { status: 400 });
  const biz = await getBusiness();
  await clearManualCatalog(biz.id);
  forgetLivePosts(biz.id);
  return NextResponse.json({ ok: true });
}

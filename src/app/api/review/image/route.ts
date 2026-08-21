// Hero image for the review page.
//   GET  ?draftId=…   → serves the current hero (base64 bytes, or redirects to a
//                       stock/product URL). 404 when the draft has no image yet.
//   POST { draftId, prefer } → regenerate ("ai") or swap to a stock photo
//                       ("stock"), store it on the draft, return its new state.

import { NextResponse } from "next/server";
import { prisma, hasDatabase } from "@/lib/db";
import { ensureHeroImage } from "@/lib/pipeline/service";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  if (!hasDatabase) return NextResponse.json({ error: "no DATABASE_URL" }, { status: 400 });
  const draftId = new URL(req.url).searchParams.get("draftId");
  if (!draftId) return NextResponse.json({ error: "draftId required" }, { status: 400 });

  const draft = await prisma.draft.findUnique({
    where: { id: draftId },
    select: { heroImageData: true, heroImageMime: true, heroImageUrl: true },
  });
  if (!draft) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (draft.heroImageData) {
    const bytes = Buffer.from(draft.heroImageData, "base64");
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": draft.heroImageMime || "image/png",
        "Cache-Control": "no-store",
      },
    });
  }
  if (draft.heroImageUrl) return NextResponse.redirect(draft.heroImageUrl);
  return NextResponse.json({ error: "no image" }, { status: 404 });
}

export async function POST(req: Request): Promise<Response> {
  if (!hasDatabase) return NextResponse.json({ error: "no DATABASE_URL" }, { status: 400 });
  const { draftId, prefer } = (await req.json().catch(() => ({}))) as {
    draftId?: string;
    prefer?: "ai" | "stock";
  };
  if (!draftId) return NextResponse.json({ error: "draftId required" }, { status: 400 });

  try {
    const result = await ensureHeroImage(draftId, { prefer, force: true });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "failed to generate image" },
      { status: 500 },
    );
  }
}

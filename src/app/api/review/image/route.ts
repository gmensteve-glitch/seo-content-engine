// Hero image for the review page.
//   GET  ?draftId=…   → serves the current hero (base64 bytes, or redirects to a
//                       stock/product URL). 404 when the draft has no image yet.
//   POST { draftId, prefer } → regenerate ("ai") or swap to a stock photo
//                       ("stock"), store it on the draft, return its new state.

import { NextResponse } from "next/server";
import { prisma, hasDatabase } from "@/lib/db";
import { ensureHeroImage, recordImageFeedback, setUploadedHeroImage } from "@/lib/pipeline/service";

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
  const { draftId, prefer, feedback, upload } = (await req.json().catch(() => ({}))) as {
    draftId?: string;
    prefer?: "ai" | "stock";
    feedback?: { verdict?: "LIKE" | "REJECT"; reason?: string };
    upload?: { base64?: string; mime?: string };
  };
  if (!draftId) return NextResponse.json({ error: "draftId required" }, { status: 400 });

  try {
    // Upload path: operator's own image.
    if (upload?.base64 && upload?.mime) {
      const result = await setUploadedHeroImage(draftId, upload.base64, upload.mime);
      return NextResponse.json(result);
    }

    // Feedback path: record it (steers all future images). On a reject, also
    // regenerate now so the learned "avoid" applies to the replacement image.
    if (feedback?.verdict) {
      await recordImageFeedback(draftId, feedback.verdict, feedback.reason ?? feedback.verdict);
      if (feedback.verdict === "REJECT") {
        const result = await ensureHeroImage(draftId, { prefer: "ai", aiOnly: true, force: true });
        return NextResponse.json({ ...result, regenerated: true });
      }
      return NextResponse.json({ recorded: true });
    }

    // Generate / rotate path. "ai" is strict (surface errors instead of silently
    // serving a stock photo); "stock" explicitly wants a real photo.
    const result = await ensureHeroImage(draftId, {
      prefer,
      aiOnly: prefer === "ai",
      force: true,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "failed to generate image" },
      { status: 500 },
    );
  }
}

// Hero image for the review page.
//   GET ?draftId=…             → serves the currently-selected hero (bytes or redirect)
//   GET ?draftId=…&imageId=…   → serves a specific gallery image (for thumbnails)
//   GET ?draftId=…&list=1      → JSON list of the draft's image options
//   POST { draftId, prefer }         → generate ("ai", strict) / stock photo ("stock")
//   POST { draftId, upload }         → store an uploaded image
//   POST { draftId, selectImageId }  → make a gallery image the selected hero
//   POST { draftId, suggest:true }   → generate a first suggestion if none exists
//   POST { draftId, feedback }       → rate the image (reject regenerates)

import { NextResponse } from "next/server";
import { prisma, hasDatabase } from "@/lib/db";
import {
  ensureHeroImage,
  recordImageFeedback,
  setUploadedHeroImage,
  listDraftImages,
  selectDraftImage,
} from "@/lib/pipeline/service";

export const dynamic = "force-dynamic";

function serveImage(data: string | null, mime: string | null, url: string | null): Response {
  if (data) {
    return new NextResponse(Buffer.from(data, "base64"), {
      headers: { "Content-Type": mime || "image/png", "Cache-Control": "no-store" },
    });
  }
  if (url) return NextResponse.redirect(url);
  return NextResponse.json({ error: "no image" }, { status: 404 });
}

export async function GET(req: Request): Promise<Response> {
  if (!hasDatabase) return NextResponse.json({ error: "no DATABASE_URL" }, { status: 400 });
  const params = new URL(req.url).searchParams;
  const draftId = params.get("draftId");
  if (!draftId) return NextResponse.json({ error: "draftId required" }, { status: 400 });

  // Gallery list.
  if (params.get("list")) {
    return NextResponse.json({ images: await listDraftImages(draftId) });
  }

  // A specific gallery image (thumbnail).
  const imageId = params.get("imageId");
  if (imageId) {
    const img = await prisma.draftImage.findFirst({
      where: { id: imageId, draftId },
      select: { data: true, mime: true, url: true },
    });
    if (!img) return NextResponse.json({ error: "not found" }, { status: 404 });
    return serveImage(img.data, img.mime, img.url);
  }

  // The currently-selected hero.
  const draft = await prisma.draft.findUnique({
    where: { id: draftId },
    select: { heroImageData: true, heroImageMime: true, heroImageUrl: true },
  });
  if (!draft) return NextResponse.json({ error: "not found" }, { status: 404 });
  return serveImage(draft.heroImageData, draft.heroImageMime, draft.heroImageUrl);
}

export async function POST(req: Request): Promise<Response> {
  if (!hasDatabase) return NextResponse.json({ error: "no DATABASE_URL" }, { status: 400 });
  const { draftId, prefer, feedback, upload, selectImageId, suggest } = (await req
    .json()
    .catch(() => ({}))) as {
    draftId?: string;
    prefer?: "ai" | "stock";
    feedback?: { verdict?: "LIKE" | "REJECT"; reason?: string };
    upload?: { base64?: string; mime?: string };
    selectImageId?: string;
    suggest?: boolean;
  };
  if (!draftId) return NextResponse.json({ error: "draftId required" }, { status: 400 });

  try {
    // Pick a previous gallery image.
    if (selectImageId) {
      return NextResponse.json(await selectDraftImage(draftId, selectImageId));
    }

    // First suggestion — generate one only if the draft has none (graceful chain).
    if (suggest) {
      const result = await ensureHeroImage(draftId); // no force: returns existing if present
      return NextResponse.json(result);
    }

    // Upload the operator's own image.
    if (upload?.base64 && upload?.mime) {
      return NextResponse.json(await setUploadedHeroImage(draftId, upload.base64, upload.mime));
    }

    // Rate the image. A reject regenerates with the learned "avoid" applied.
    if (feedback?.verdict) {
      await recordImageFeedback(draftId, feedback.verdict, feedback.reason ?? feedback.verdict);
      if (feedback.verdict === "REJECT") {
        const result = await ensureHeroImage(draftId, { prefer: "ai", aiOnly: true, force: true });
        return NextResponse.json({ ...result, regenerated: true });
      }
      return NextResponse.json({ recorded: true });
    }

    // Generate / rotate. "ai" is strict (surfaces errors); "stock" wants a real photo.
    const result = await ensureHeroImage(draftId, { prefer, aiOnly: prefer === "ai", force: true });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "failed to generate image" },
      { status: 500 },
    );
  }
}

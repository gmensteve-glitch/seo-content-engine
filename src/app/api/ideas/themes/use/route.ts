// Turn ticked theme titles into blogs: each becomes a "From my themes" idea,
// then brief → write → grade → Ready in the background (same pipeline and
// quality bar as every other blog). Auth-gated by middleware.

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { hasDatabase } from "@/lib/db";
import { getBusiness } from "@/lib/data/repo";
import { pickThemeTitles } from "@/lib/pipeline/themes";
import { buildBriefFromIdea, approveBrief } from "@/lib/pipeline/service";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  if (!hasDatabase) return NextResponse.json({ error: "no DATABASE_URL" }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as { picks?: { id: string; title: string }[] };
  const picks = Array.isArray(body.picks)
    ? body.picks.filter((p) => p && typeof p.id === "string").map((p) => ({ id: p.id, title: String(p.title ?? "") }))
    : [];
  if (!picks.length) return NextResponse.json({ error: "Tick at least one title." }, { status: 400 });
  try {
    const biz = await getBusiness();
    const result = await pickThemeTitles(biz.id, picks);
    // Build each blog out of band (a brief is a research call per piece). An
    // idea whose brief fails stays in the Idea box marked "From my themes".
    void (async () => {
      for (const s of result.started) {
        try {
          await approveBrief(await buildBriefFromIdea(s.ideaId));
        } catch (e) {
          console.error(`[themes] couldn't start “${s.title}”:`, e instanceof Error ? e.message : e);
        }
      }
    })();
    revalidatePath("/ideas");
    revalidatePath("/pipeline");
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const error = e instanceof Error ? e.message : "Couldn't use those titles";
    console.error("[themes] use failed:", error);
    return NextResponse.json({ error }, { status: 500 });
  }
}

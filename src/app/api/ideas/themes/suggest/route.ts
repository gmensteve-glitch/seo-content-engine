// "Ideas from my themes & keywords": suggest titles for each typed line, each
// with its closest existing post. Auth-gated by middleware.

import { NextResponse } from "next/server";
import { hasDatabase } from "@/lib/db";
import { getBusiness } from "@/lib/data/repo";
import { suggestThemeTitles } from "@/lib/pipeline/themes";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request): Promise<Response> {
  if (!hasDatabase) return NextResponse.json({ error: "no DATABASE_URL" }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as {
    lines?: string[];
    kind?: string;
    pillarId?: string | null;
    perLine?: number;
  };
  try {
    const biz = await getBusiness();
    const lines = await suggestThemeTitles(biz.id, {
      lines: Array.isArray(body.lines) ? body.lines.map(String) : [],
      kind: body.kind === "LOCAL" ? "LOCAL" : "EVERGREEN",
      pillarId: body.pillarId || null,
      perLine: Number(body.perLine) || 5,
    });
    return NextResponse.json({ ok: true, lines });
  } catch (e) {
    const error = e instanceof Error ? e.message : "Couldn't suggest titles";
    console.error("[themes] suggest failed:", error);
    return NextResponse.json({ error }, { status: 500 });
  }
}

// Dev-only intake runner. Crawls a business's site and saves its generated
// profile + brand voice + pillars. Disabled in production unless
// ENABLE_DEV_ROUTES is set.

import { NextResponse } from "next/server";
import { hasDatabase } from "@/lib/db";
import { runAndSaveIntake } from "@/lib/pipeline/service";

export const dynamic = "force-dynamic";

function disabled(): boolean {
  return process.env.NODE_ENV === "production" && !process.env.ENABLE_DEV_ROUTES;
}

export async function POST(req: Request): Promise<Response> {
  if (disabled()) return NextResponse.json({ error: "dev routes disabled" }, { status: 403 });
  if (!hasDatabase) return NextResponse.json({ error: "no DATABASE_URL" }, { status: 400 });

  const { businessId } = (await req.json().catch(() => ({}))) as { businessId?: string };
  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });

  const profile = await runAndSaveIntake(businessId);
  return NextResponse.json(profile);
}

// Manual trigger for the content-calendar rollout. Publishes every scheduled
// draft whose date has arrived (what the Inngest cron will call in production).
// Handy for testing the calendar without waiting for the clock. Disabled in
// production unless ENABLE_DEV_ROUTES is set.

import { NextResponse } from "next/server";
import { hasDatabase } from "@/lib/db";
import { publishScheduled } from "@/lib/pipeline/service";

export const dynamic = "force-dynamic";

function disabled(): boolean {
  return process.env.NODE_ENV === "production" && !process.env.ENABLE_DEV_ROUTES;
}

export async function POST(): Promise<Response> {
  if (disabled()) return NextResponse.json({ error: "dev routes disabled" }, { status: 403 });
  if (!hasDatabase) return NextResponse.json({ error: "no DATABASE_URL" }, { status: 400 });

  const { published } = await publishScheduled();
  return NextResponse.json({ publishedCount: published.length, published });
}

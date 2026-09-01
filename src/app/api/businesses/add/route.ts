// Add a new store: create the business (+ default pillars) and make it active.
// The client then sends the operator to Connectors to wire up Shopify + GSC.
import { NextResponse } from "next/server";
import { hasDatabase } from "@/lib/db";
import { createBusiness, runAndSaveIntake } from "@/lib/pipeline/service";
import { ACTIVE_BIZ_COOKIE } from "@/lib/active-business";

export const dynamic = "force-dynamic";

const YEAR = 60 * 60 * 24 * 365;

export async function POST(req: Request): Promise<Response> {
  if (!hasDatabase) return NextResponse.json({ error: "no database" }, { status: 400 });
  const { name, domain } = (await req.json().catch(() => ({}))) as { name?: string; domain?: string };
  if (!name?.trim() || !domain?.trim()) {
    return NextResponse.json({ error: "name and domain are required" }, { status: 400 });
  }
  let id: string;
  try {
    id = await createBusiness({ name, domain });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "could not create store" },
      { status: 400 },
    );
  }

  // Kick off brand intake in the background — crawl the site to build the store's
  // profile, voice, and pillars so its content isn't generic. Best-effort.
  void runAndSaveIntake(id).catch((e) =>
    console.error("[add-store] intake failed:", e instanceof Error ? e.message : e),
  );
  const res = NextResponse.json({ ok: true, id });
  res.cookies.set(ACTIVE_BIZ_COOKIE, id, { path: "/", httpOnly: true, sameSite: "lax", maxAge: YEAR });
  return res;
}

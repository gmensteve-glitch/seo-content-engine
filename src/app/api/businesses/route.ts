// Business roster for the header switcher: every store + which one is active.
import { NextResponse } from "next/server";
import { getBusinesses } from "@/lib/data/repo";
import { activeBizId } from "@/lib/active-business";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const [businesses, activeId] = await Promise.all([getBusinesses(), activeBizId()]);
  return NextResponse.json({
    businesses: businesses.map((b) => ({
      id: b.id,
      name: b.name,
      short: b.short,
      cms: b.cms,
      status: b.status,
    })),
    activeId,
  });
}

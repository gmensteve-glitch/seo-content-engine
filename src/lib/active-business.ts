// Resolves the "active" business for the current request from a cookie, so the
// whole dashboard can be scoped to whichever Shopify store the operator picked.
// Falls back to the first business when the cookie is missing/stale. Server-only
// (reads next/headers cookies()).

import { cookies } from "next/headers";
import { prisma, hasDatabase } from "@/lib/db";

export const ACTIVE_BIZ_COOKIE = "active_biz";

/** The active business id for this request (cookie → else the oldest business). */
export async function activeBizId(): Promise<string> {
  if (!hasDatabase) return "trustedcaskets";
  let cookieVal: string | undefined;
  try {
    cookieVal = (await cookies()).get(ACTIVE_BIZ_COOKIE)?.value;
  } catch {
    // cookies() can throw outside a request scope (e.g. background jobs) — ignore.
  }
  if (cookieVal) {
    const exists = await prisma.business
      .findUnique({ where: { id: cookieVal }, select: { id: true } })
      .catch(() => null);
    if (exists) return exists.id;
  }
  const first = await prisma.business
    .findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } })
    .catch(() => null);
  return first?.id ?? "trustedcaskets";
}

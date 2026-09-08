"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** While any page is being drafted, re-render every few seconds so the row
 *  flips to Draft ready / Needs fix without a manual reload. */
export function CategoryPoll({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), 8000);
    return () => clearInterval(t);
  }, [active, router]);
  return null;
}

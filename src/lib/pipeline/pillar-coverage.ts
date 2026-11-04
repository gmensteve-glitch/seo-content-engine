// How many posts the store already has under each content pillar, counting
// EVERY article on Shopify (not only the ones the engine published), so the
// ideator sees real coverage instead of "No content published yet".
//
// Titles are sorted into pillars by one small model call (Haiku), cached per
// store for six hours; offline, by word overlap with the pillar's name and
// description.

import { prisma } from "@/lib/db";
import { structured, MODELS } from "@/lib/ai/claude";
import { aiEnabled } from "@/lib/env";
import { getLivePosts } from "@/lib/pipeline/live-posts";
import { topicWords } from "@/lib/pipeline/dedupe";

export interface PillarCoverage {
  /** Where the post list came from: Shopify (or its sitemap), or only the engine's own Page rows. */
  source: "store" | "engine";
  total: number;
  byPillar: { pillar: string; posts: number }[];
  unassigned: number;
}

const TTL_MS = 6 * 60 * 60 * 1000;
const cache = new Map<string, { at: number; key: string; coverage: PillarCoverage }>();

function offlinePillar(title: string, pillars: { name: string; description: string | null }[]): number {
  const words = topicWords(title);
  let best = -1;
  let bestScore = 0;
  pillars.forEach((p, i) => {
    const pw = topicWords(`${p.name} ${p.description ?? ""}`);
    let hit = 0;
    for (const w of words) if (pw.has(w)) hit++;
    if (hit > bestScore) {
      best = i;
      bestScore = hit;
    }
  });
  return best;
}

async function classify(titles: string[], pillars: { name: string; description: string | null }[]): Promise<number[]> {
  if (!aiEnabled()) return titles.map((t) => offlinePillar(t, pillars));
  const out: number[] = [];
  const pillarList = pillars.map((p, i) => `${i}: ${p.name}${p.description ? ` (${p.description})` : ""}`).join("\n");
  for (let start = 0; start < titles.length; start += 150) {
    const batch = titles.slice(start, start + 150);
    const { pillars: picks } = await structured<{ pillars: number[] }>({
      model: MODELS.extract,
      cheap: true,
      maxTokens: 2000,
      schema: {
        type: "object",
        additionalProperties: false,
        properties: { pillars: { type: "array", items: { type: "integer" } } },
        required: ["pillars"],
      },
      context: [`Sort blog articles into content pillars.\n\nPILLARS:\n${pillarList}`],
      prompt:
        `For each article title below, give the number of the pillar it belongs to, or -1 if none fits. ` +
        `Return exactly ${batch.length} numbers, in order.\n\n` +
        batch.map((t, i) => `${i}. ${t}`).join("\n"),
    });
    for (let i = 0; i < batch.length; i++) {
      const v = picks[i];
      out.push(Number.isInteger(v) && v >= 0 && v < pillars.length ? v : -1);
    }
  }
  return out;
}

export async function pillarCoverage(businessId: string): Promise<PillarCoverage> {
  const [pillars, live] = await Promise.all([
    prisma.pillar.findMany({ where: { businessId }, orderBy: { createdAt: "asc" } }),
    getLivePosts(businessId),
  ]);

  // The store's own list when it can be read; otherwise only what the engine
  // itself published (better than nothing, and labeled as such).
  let titles: string[];
  let source: PillarCoverage["source"];
  if (live.ok) {
    titles = live.posts.filter((p) => p.status === "published").map((p) => p.title);
    source = "store";
  } else {
    const pages = await prisma.page.findMany({
      where: { businessId, publishedAt: { not: null } },
      select: { draft: { select: { title: true } } },
    });
    titles = pages.flatMap((p) => (p.draft?.title ? [p.draft.title] : []));
    source = "engine";
  }

  const key = `${source}|${pillars.map((p) => p.name).join("|")}|${titles.length}|${titles.slice(0, 50).join("|")}`;
  const hit = cache.get(businessId);
  if (hit && hit.key === key && Date.now() - hit.at < TTL_MS) return hit.coverage;

  const counts = pillars.map(() => 0);
  let unassigned = 0;
  if (pillars.length && titles.length) {
    const picks = await classify(titles, pillars).catch((e) => {
      console.error("[coverage] classify failed, using word match:", e instanceof Error ? e.message : e);
      return titles.map((t) => offlinePillar(t, pillars));
    });
    for (const i of picks) {
      if (i >= 0) counts[i]++;
      else unassigned++;
    }
  } else {
    unassigned = titles.length;
  }
  const coverage: PillarCoverage = {
    source,
    total: titles.length,
    byPillar: pillars.map((p, i) => ({ pillar: p.name, posts: counts[i] })),
    unassigned,
  };
  cache.set(businessId, { at: Date.now(), key, coverage });
  return coverage;
}

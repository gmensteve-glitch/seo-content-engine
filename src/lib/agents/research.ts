// The deep competitive research agent — builds a "gap map" content brief before
// any writing. Pulls the SERP (DataForSEO) + scrapes competitors (Firecrawl),
// then has Claude synthesize the wedge and the plan.

import { structured, MODELS } from "@/lib/ai/claude";
import { serpTop } from "@/lib/connectors/dataforseo";
import { scrapeMany } from "@/lib/connectors/firecrawl";
import { aiEnabled, dataforseoEnabled, firecrawlEnabled } from "@/lib/env";
import { offlineBrief } from "@/lib/ai/offline";

export interface BriefSpec {
  title: string;
  targetKeyword: string;
  angle: string;
  gap: string; // what everyone covers vs the hole we fill
  wordTarget: number;
  outline: string[];
  questions: string[];
  requiredSchema: string[];
}

const BRIEF_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    angle: { type: "string" },
    gap: { type: "string" },
    wordTarget: { type: "integer" },
    outline: { type: "array", items: { type: "string" } },
    questions: { type: "array", items: { type: "string" } },
    requiredSchema: { type: "array", items: { type: "string" } },
  },
  required: ["title", "angle", "gap", "wordTarget", "outline", "questions", "requiredSchema"],
};

const RESEARCH_SYSTEM = `You are an SEO strategist. Given the top-ranking pages for a keyword, find what they all cover and — more importantly — the gap none of them fill well. Design a brief that will beat them by being more complete and more citable. Ground the brief in what the competitor pages actually contain; do not invent facts.`;

export interface ResearchInput {
  targetKeyword: string;
  businessContext: string; // from client.md
  serpLimit?: number;
}

export async function buildBrief(input: ResearchInput): Promise<BriefSpec> {
  if (!aiEnabled()) return offlineBrief(input.targetKeyword);

  // SERP + competitor scraping are ENRICHMENT, not hard dependencies. If a data
  // provider is down (e.g. DataForSEO 5xx) we degrade to a keyword+context brief
  // rather than failing the whole pipeline — a resilient long-running system
  // should never let one flaky upstream strand a piece.
  let serp: Awaited<ReturnType<typeof serpTop>> = [];
  if (dataforseoEnabled()) {
    try {
      serp = await serpTop(input.targetKeyword, { limit: input.serpLimit ?? 10 });
    } catch (e) {
      console.error("[research] SERP fetch failed, degrading:", e instanceof Error ? e.message : e);
    }
  }
  let pages: Awaited<ReturnType<typeof scrapeMany>> = [];
  if (firecrawlEnabled() && serp.length) {
    try {
      pages = await scrapeMany(serp.slice(0, 6).map((r) => r.url));
    } catch (e) {
      console.error("[research] competitor scrape failed, degrading:", e instanceof Error ? e.message : e);
    }
  }

  const competitorSummary = pages
    .map(
      (p, i) =>
        `#${i + 1} ${p.title} (${p.wordCount} words)\n${p.markdown.slice(0, 2500)}`
    )
    .join("\n\n---\n\n");

  // The brief LLM call is the last step — but a transient API error, rate limit,
  // or a schema/parse hiccup must NOT strand the idea (the "Build blog" button
  // would silently do nothing). Fall back to a solid offline brief so a piece is
  // always produced; the writer then does the heavy lifting anyway.
  let raw: Omit<BriefSpec, "targetKeyword">;
  try {
    raw = await structured<Omit<BriefSpec, "targetKeyword">>({
      model: MODELS.research,
      system: RESEARCH_SYSTEM,
      schema: BRIEF_SCHEMA,
      prompt: `TARGET KEYWORD: ${input.targetKeyword}\n\nBUSINESS CONTEXT:\n${input.businessContext}\n\nTOP-RANKING COMPETITOR PAGES:\n${competitorSummary || "(none scraped — infer from the keyword and business context)"}\n\nProduce a content brief: the winning title, the angle/wedge, the specific gap competitors leave open, a target word count, a section outline, the questions the page must answer, and which schema.org types to include.`,
    });
  } catch (e) {
    console.error("[research] brief LLM call failed, using offline brief:", e instanceof Error ? e.message : e);
    return offlineBrief(input.targetKeyword);
  }

  // Clamp the target to a reader-friendly band — most blog posts win at
  // 1,000–2,200 words; anything longer tends to bury the answer.
  const wordTarget = Math.max(900, Math.min(2200, Math.round(raw.wordTarget || 1600)));
  return { ...raw, wordTarget, targetKeyword: input.targetKeyword };
}

// The enrichment agent — lifts a near-miss draft over the quality bar using the
// REAL resources we already have, with NO human input: the business's own
// Shopify product catalog (real prices/specs) and excerpts from authoritative
// web sources (real, cited facts). It never fabricates a figure, price, stat, or
// citation — it can only use what's handed to it. This is how "don't use me,
// use the resources" is honored: depth + E-E-A-T get real substance
// automatically.

import { completeText, MODELS } from "@/lib/ai/claude";
import { aiEnabled } from "@/lib/env";
import type { BriefSpec } from "@/lib/agents/research";

export interface ProductFact {
  title: string;
  price?: string;
  specs?: string;
}

export interface SourceExcerpt {
  url: string;
  title: string;
  excerpt: string;
}

export interface EnrichResources {
  products: ProductFact[];
  sources: SourceExcerpt[];
}

export function hasResources(res: EnrichResources): boolean {
  return res.products.length > 0 || res.sources.length > 0;
}

/**
 * Revise `draft` to strengthen the weak dimensions using ONLY the provided real
 * facts. Returns the enriched Markdown (or the draft unchanged when there's
 * nothing real to add, or AI is unavailable).
 */
export async function enrichDraft(
  draft: string,
  brief: BriefSpec,
  weakest: string[],
  res: EnrichResources,
): Promise<string> {
  if (!aiEnabled() || !hasResources(res)) return draft;

  const productBlock = res.products.length
    ? res.products
        .map(
          (p) =>
            `- ${p.title}${p.price ? ` — ${p.price}` : ""}${p.specs ? ` (${p.specs})` : ""}`,
        )
        .join("\n")
    : "(none available)";

  const sourceBlock = res.sources.length
    ? res.sources
        .map((s, i) => `[S${i + 1}] ${s.title} — ${s.url}\n${s.excerpt.slice(0, 1600)}`)
        .join("\n\n---\n\n")
    : "(none available)";

  const prompt = `A draft fell just short of the quality bar. Strengthen it WITHOUT any human input, using ONLY the real facts below — the business's own product catalog and excerpts from authoritative sources. NEVER invent a figure, price, statistic, date, or citation; if the data doesn't support a claim, don't make it.

TARGET KEYWORD: ${brief.targetKeyword}
WEAK DIMENSIONS to lift (focus here): ${weakest.join(", ")}

REAL PRODUCT DATA — the business's OWN catalog. Use concrete prices/specs where they make the page more useful and authoritative:
${productBlock}

AUTHORITATIVE SOURCE EXCERPTS — weave in real facts and LINK the source inline as a markdown link to its URL:
${sourceBlock}

Rules:
- Replace vague statements with specific, verifiable ones drawn from the data above. This is what lifts depth + E-E-A-T.
- Every external fact must link its source as a markdown link. Product facts come from the store, so no link needed for those.
- Do NOT pad length — swap fluff for substance; keep it tight.
- Preserve the structure, FAQ, and the JSON-LD block (keep it valid).
- Delete any "> **Add your experience:**" callouts that the data above now satisfies.
- Return the full revised Markdown only.

DRAFT:
${draft}`;

  return completeText({ model: MODELS.writer, prompt, maxTokens: 16000 });
}

const REWRITE_SYSTEM = `You are an editor. Revise the passage exactly as instructed. Return ONLY the revised passage text — no preamble, no quotes, no code fences, no explanation. Match the surrounding article's tone and Markdown style. Never fabricate facts, prices, statistics, or citations; if the instruction asks for a fact you don't have, rephrase without inventing one.`;

/**
 * Reword/change a single highlighted passage per a short instruction (the
 * "highlight → tell the chatbox what to do" flow). Returns just the revised
 * passage; the caller splices it back into the draft.
 */
export async function rewritePassage(passage: string, instruction: string): Promise<string> {
  if (!aiEnabled() || !passage.trim() || !instruction.trim()) return passage;
  const out = await completeText({
    model: MODELS.writer,
    system: REWRITE_SYSTEM,
    prompt: `INSTRUCTION: ${instruction}\n\nPASSAGE:\n${passage}`,
    maxTokens: 2000,
  });
  return out.trim() || passage;
}

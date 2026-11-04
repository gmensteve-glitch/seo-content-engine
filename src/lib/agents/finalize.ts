// Auto-finalize a written draft so no mechanical defect ever reaches the Ready
// list. Runs BEFORE grading, so the score reflects the cleaned piece. Hard
// guarantees:
//   1. No leftover "> **Add your experience:**" placeholder callouts (a template
//      artifact — in a hands-off pipeline there's no human to fill them).
//   2. No JSON-LD (or any ```json block) in the article body. Schema is kept
//      separate: buildSchemaJsonLd makes it from the article for the copy
//      package, where the operator can use it or ignore it.
//   3. No "About the Author" sections or bylines (no invented people; the
//      byline comes from the store's real Shopify authors at copy time).

import { stripAuthorSections } from "@/lib/agents/no-invented-people";

export interface FinalizeContext {
  title: string;
  metaDescription: string;
  brandName: string;
  isoDate: string; // caller supplies (keeps this pure/testable)
}

/** Remove the writer's "Add your experience" placeholder callouts entirely. */
export function stripPlaceholders(md: string): string {
  return md
    // Blockquote form: "> **Add your experience:** …" (may wrap across lines
    // until a blank line).
    .replace(/(^|\n)>\s*\*\*Add your experience:?\*\*[\s\S]*?(?=\n\s*\n|\n#{1,6}\s|$)/gi, "$1")
    // Any stray inline remnant.
    .replace(/\*\*Add your experience:?\*\*[^\n]*/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}

/**
 * Remove every ```json / ```ld+json fence (closed, or unterminated at the end
 * because the writer ran out of room) and any raw <script type="application/
 * ld+json"> block from the body.
 */
export function stripJsonLdBlocks(md: string): string {
  return md
    .replace(/```(?:json|ld\+json|jsonld|json-ld)\b[\s\S]*?```/gi, "")
    .replace(/```(?:json|ld\+json|jsonld|json-ld)\b[\s\S]*$/i, "")
    .replace(/<script[^>]*application\/ld\+json[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}

/** Best-effort parse of the article's FAQ section into {q,a} pairs. */
function parseFaq(body: string): { q: string; a: string }[] {
  const lines = body.split("\n");
  // Find the FAQ heading.
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^#{2,4}\s+.*(faq|frequently asked)/i.test(lines[i].trim())) {
      start = i + 1;
      break;
    }
  }
  if (start === -1) return [];

  const pairs: { q: string; a: string }[] = [];
  let q: string | null = null;
  let a: string[] = [];
  const flush = () => {
    if (q && a.join(" ").trim()) pairs.push({ q, a: a.join(" ").trim() });
    q = null;
    a = [];
  };
  for (let i = start; i < lines.length; i++) {
    const line = lines[i].trim();
    // A new top-level (##) heading that's not a question ends the FAQ section.
    if (/^##\s/.test(line) && !/\?\s*$/.test(line)) {
      flush();
      break;
    }
    const headingQ = line.match(/^#{3,4}\s+(.*\?)\s*$/); // "### Question?"
    const boldQ = line.match(/^\*\*(.*\?)\*\*\s*$/); // "**Question?**"
    const question = headingQ?.[1] ?? boldQ?.[1];
    if (question) {
      flush();
      q = question.trim();
    } else if (q && line) {
      a.push(line.replace(/[*_`>#]/g, ""));
    }
  }
  flush();
  return pairs.slice(0, 12);
}

/** A valid JSON-LD graph (Article + FAQPage) built from the article itself, for
 *  the copy package. Author and publisher are the store, never a person. */
export function buildSchemaJsonLd(body: string, ctx: FinalizeContext): string {
  const graph: Record<string, unknown>[] = [
    {
      "@type": "Article",
      headline: ctx.title,
      description: ctx.metaDescription,
      author: { "@type": "Organization", name: ctx.brandName },
      publisher: { "@type": "Organization", name: ctx.brandName },
      datePublished: ctx.isoDate,
      dateModified: ctx.isoDate,
    },
  ];
  const faq = parseFaq(body);
  if (faq.length >= 2) {
    graph.push({
      "@type": "FAQPage",
      mainEntity: faq.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    });
  }
  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph }, null, 2);
}

/**
 * Finalize a draft body: strip placeholders, any JSON-LD block, and author
 * sections/bylines. Returns the article only.
 */
export function finalizeDraftBody(md: string): string {
  return `${stripAuthorSections(stripJsonLdBlocks(stripPlaceholders(md)))}\n`;
}

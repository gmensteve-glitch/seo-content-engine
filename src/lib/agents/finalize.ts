// Auto-finalize a written draft so no mechanical defect ever reaches the Ready
// list. Runs BEFORE grading, so the score reflects the cleaned piece. Two hard
// guarantees:
//   1. No leftover "> **Add your experience:**" placeholder callouts (a template
//      artifact — in a hands-off pipeline there's no human to fill them).
//   2. The trailing JSON-LD block always parses as valid JSON. If the writer
//      truncated it (ran out of tokens mid-schema) or emitted invalid JSON, we
//      rebuild a clean, valid schema graph from the article itself.

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

/** Split off the trailing ```json fence (closed OR truncated) from the body. */
function splitTrailingJsonLd(md: string): { body: string; jsonText: string | null } {
  const idx = md.lastIndexOf("```json");
  if (idx === -1) return { body: md, jsonText: null };
  const after = md.slice(idx + "```json".length);
  const close = after.indexOf("```");
  const jsonText = (close === -1 ? after : after.slice(0, close)).trim();
  return { body: md.slice(0, idx).trimEnd(), jsonText };
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

/** Build a guaranteed-valid JSON-LD graph from the article itself. */
function buildJsonLd(body: string, ctx: FinalizeContext): string {
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

function isValidJson(s: string): boolean {
  try {
    JSON.parse(s);
    return true;
  } catch {
    return false;
  }
}

/**
 * Finalize a draft body: strip placeholders and guarantee a valid JSON-LD block.
 * Keeps the writer's own schema when it's valid; rebuilds it when it isn't.
 */
export function finalizeDraftBody(md: string, ctx: FinalizeContext): string {
  const cleaned = stripPlaceholders(md);
  const { body, jsonText } = splitTrailingJsonLd(cleaned);

  // Keep the writer's schema if it's present and valid; otherwise rebuild.
  const jsonLd = jsonText && isValidJson(jsonText) ? jsonText : buildJsonLd(body, ctx);
  return `${body}\n\n\`\`\`json\n${jsonLd}\n\`\`\`\n`;
}

// Internal-linking agent (pipeline stage 8) — surgical, intentional links that
// build topical authority. Unlike the writer (which invents plausible links),
// this reads the business's REAL published pages and links to them with natural,
// verbatim anchor text, both forward (new → existing) and backward
// (existing → new). Enforces a per-page cap and anti-spam rules.

import { structured, MODELS } from "@/lib/ai/claude";
import { aiEnabled } from "@/lib/env";

export interface LinkTarget {
  pageId: string;
  url: string;
  title: string;
  keyword?: string;
}

export interface PlannedLink {
  targetPageId: string;
  url: string;
  anchorText: string; // a phrase that appears VERBATIM in the source markdown
}

const SYSTEM = `You are an SEO internal-linking specialist. You place internal links that build topical authority: contextually relevant, with natural anchor text drawn from the existing copy, pointing to the most related pages, spread across the body, never keyword-stuffed or spammy. Fewer, better links beat many forced ones.`;

function linkSchema(maxLinks: number): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      // NOTE: no JSON-Schema `maxItems` here — the Anthropic structured-output
      // API rejects it ("property 'maxItems' is not supported"). The cap is
      // enforced after the fact in sanitizeLinks() via slice(maxLinks) and the
      // "up to N" instruction in the prompt.
      links: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            targetPageId: { type: "string", description: "id of the page to link to" },
            anchorText: {
              type: "string",
              description: "a short phrase copied VERBATIM from the source text to hyperlink",
            },
          },
          required: ["targetPageId", "anchorText"],
        },
      },
    },
    required: ["links"],
  };
}

/** Choose up to maxLinks real, relevant internal links for `markdown`. */
export async function planLinks(
  markdown: string,
  targets: LinkTarget[],
  maxLinks = 4,
): Promise<PlannedLink[]> {
  if (targets.length === 0 || maxLinks <= 0) return [];

  if (!aiEnabled()) return offlinePlanLinks(markdown, targets, maxLinks);

  const targetList = targets
    .map((t) => `- id:${t.pageId} | ${t.title} (${t.url})${t.keyword ? ` | keyword: ${t.keyword}` : ""}`)
    .join("\n");

  const raw = await structured<{ links: { targetPageId: string; anchorText: string }[] }>({
    model: MODELS.writer,
    system: SYSTEM,
    schema: linkSchema(maxLinks),
    prompt: `EXISTING PAGES you may link to:\n${targetList}\n\nSOURCE (markdown):\n${markdown}\n\nSelect up to ${maxLinks} of the MOST topically relevant pages to link from this source. For each, pick an anchor phrase that appears VERBATIM in the source body, reads naturally, and sits where a reader would actually want that link. Never link the same phrase twice, never link a page to itself, and spread links across different sections. Only include genuinely relevant links.`,
  });

  return sanitizeLinks(markdown, raw.links, targets, maxLinks);
}

/** Keyword/title match fallback when the model is unavailable. */
function offlinePlanLinks(markdown: string, targets: LinkTarget[], maxLinks: number): PlannedLink[] {
  const out: PlannedLink[] = [];
  const used = new Set<string>();
  for (const t of targets) {
    const phrase = t.keyword && markdown.includes(t.keyword) ? t.keyword : t.title;
    if (!markdown.includes(phrase) || used.has(phrase)) continue;
    used.add(phrase);
    out.push({ targetPageId: t.pageId, url: t.url, anchorText: phrase });
    if (out.length >= maxLinks) break;
  }
  return out;
}

function sanitizeLinks(
  markdown: string,
  links: { targetPageId: string; anchorText: string }[],
  targets: LinkTarget[],
  maxLinks: number,
): PlannedLink[] {
  const byId = new Map(targets.map((t) => [t.pageId, t]));
  const seenAnchor = new Set<string>();
  const seenTarget = new Set<string>();
  const out: PlannedLink[] = [];
  for (const l of links) {
    const t = byId.get(l.targetPageId);
    if (!t) continue;
    if (!l.anchorText || !markdown.includes(l.anchorText)) continue;
    if (seenAnchor.has(l.anchorText) || seenTarget.has(l.targetPageId)) continue;
    seenAnchor.add(l.anchorText);
    seenTarget.add(l.targetPageId);
    out.push({ targetPageId: t.pageId, url: t.url, anchorText: l.anchorText });
    if (out.length >= maxLinks) break;
  }
  return out;
}

/** Insert markdown links, replacing the first UNLINKED occurrence of each anchor. */
export function applyLinks(markdown: string, links: PlannedLink[]): string {
  let out = markdown;
  for (const l of links) {
    const idx = findUnlinkedOccurrence(out, l.anchorText);
    if (idx === -1) continue;
    out = out.slice(0, idx) + `[${l.anchorText}](${l.url})` + out.slice(idx + l.anchorText.length);
  }
  return out;
}

/** First occurrence of `anchor` not already part of a markdown link, and not
 *  inside a heading line (avoid linking H1/H2 text). */
function findUnlinkedOccurrence(text: string, anchor: string): number {
  let from = 0;
  while (from <= text.length) {
    const idx = text.indexOf(anchor, from);
    if (idx === -1) return -1;
    const before = text[idx - 1];
    const after = text.slice(idx + anchor.length, idx + anchor.length + 2);
    const lineStart = text.lastIndexOf("\n", idx) + 1;
    const isHeading = /^\s{0,3}#{1,6}\s/.test(text.slice(lineStart, idx + anchor.length));
    const alreadyLinked = before === "[" || after === "](";
    if (!alreadyLinked && !isHeading) return idx;
    from = idx + anchor.length;
  }
  return -1;
}

// The two boxes every blog opens with, after its intro:
//
//   ## In this guide        — a table of contents: up to 6 short, plain,
//                              numbered section labels (no links)
//   ## What to know first   — exactly 5 key takeaways, one sentence each,
//                              at most 15 words, each restating the article
//
// The writer is asked for them, but nothing here trusts it: ensureGuideBlocks
// checks them on every draft and rebuilds them (one small structured call)
// when they're missing or off-spec. There is no "Quick answer" block; an old
// one is folded back into plain intro prose. markdownToHtml renders both
// sections as styled boxes.

import { structured, MODELS } from "@/lib/ai/claude";
import { aiEnabled } from "@/lib/env";
import { headingId } from "@/lib/cms/markdown";

export const TOC_TITLE = "In this guide";
export const TAKEAWAYS_TITLE = "What to know first";
export const MAX_TOC = 6;
export const TAKEAWAY_COUNT = 5;
export const MAX_TAKEAWAY_WORDS = 15;

export interface GuideBlocks {
  /** Plain section labels — deliberately not links. */
  toc: string[];
  takeaways: string[];
}

const TOC_RE = /^##\s+in this guide\s*$/i;
const TAKEAWAYS_RE = /^##\s+what to know first\s*$/i;
const LEGACY_TOC_RE = /^#{2,3}\s+(table of contents|contents|in this article|on this page)\s*$/i;
const QUICK_HEADING_RE = /^#{2,3}\s+quick answer:?\s*$/i;

/** Words in a sentence, markdown stripped. */
export function wordCount(s: string): number {
  return s
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`]/g, "")
    .split(/\s+/)
    .filter((w) => /[A-Za-z0-9]/.test(w)).length;
}

/** Split off the trailing JSON-LD fence so edits never touch the schema. */
function splitSchema(md: string): { body: string; schema: string } {
  const idx = md.lastIndexOf("```json");
  if (idx === -1) return { body: md, schema: "" };
  return { body: md.slice(0, idx).replace(/\s+$/, ""), schema: md.slice(idx) };
}

/** [start, end) line ranges of the guide sections and any legacy TOC section. */
function sectionRanges(lines: string[]): { kind: "toc" | "takeaways" | "legacy"; start: number; end: number }[] {
  const out: { kind: "toc" | "takeaways" | "legacy"; start: number; end: number }[] = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t.startsWith("```")) inFence = !inFence;
    if (inFence) continue;
    const kind = TOC_RE.test(t) ? "toc" : TAKEAWAYS_RE.test(t) ? "takeaways" : LEGACY_TOC_RE.test(t) ? "legacy" : null;
    if (!kind) continue;
    let end = i + 1;
    while (end < lines.length && !/^#{1,6}\s/.test(lines[end].trim()) && !lines[end].trim().startsWith("```")) end++;
    out.push({ kind, start: i, end });
    i = end - 1;
  }
  return out;
}

/** Character ranges of the guide boxes (the linker must not add links inside them). */
export function guideRanges(md: string): [number, number][] {
  const lines = md.split("\n");
  const offsets: number[] = [];
  let pos = 0;
  for (const l of lines) {
    offsets.push(pos);
    pos += l.length + 1;
  }
  return sectionRanges(lines)
    .filter((r) => r.kind !== "legacy")
    .map((r) => [offsets[r.start], r.end < offsets.length ? offsets[r.end] : md.length]);
}

/** The H2/H3 headings a TOC entry may point at (guide/legacy sections excluded). */
export function sectionHeadings(md: string): { level: number; text: string; id: string }[] {
  const out: { level: number; text: string; id: string }[] = [];
  let inFence = false;
  for (const line of md.split("\n")) {
    const t = line.trim();
    if (t.startsWith("```")) inFence = !inFence;
    if (inFence) continue;
    const m = t.match(/^(#{2,3})\s+(.*)$/);
    if (!m) continue;
    if (TOC_RE.test(t) || TAKEAWAYS_RE.test(t) || LEGACY_TOC_RE.test(t) || QUICK_HEADING_RE.test(t)) continue;
    let text = m[2].trim();
    let id = "";
    const attr = text.match(/\s*\{#([A-Za-z0-9_-]+)\}\s*$/);
    if (attr) {
      id = attr[1];
      text = text.slice(0, text.length - attr[0].length).trim();
    }
    out.push({ level: m[1].length, text, id: id || headingId(text) });
  }
  return out;
}

/** The blocks as they currently stand in the draft (empty when absent). */
export function readGuideBlocks(md: string): GuideBlocks & { hasToc: boolean; hasTakeaways: boolean; tocLinked: boolean } {
  const lines = md.split("\n");
  const res = { toc: [] as string[], takeaways: [] as string[], hasToc: false, hasTakeaways: false, tocLinked: false };
  for (const r of sectionRanges(lines)) {
    const body = lines.slice(r.start + 1, r.end).map((l) => l.trim()).filter(Boolean);
    if (r.kind === "toc") {
      res.hasToc = true;
      for (const l of body) {
        const m = l.match(/^(?:\d+[.)]|[-*+])\s+(.*)$/);
        if (!m || !m[1].trim()) continue;
        if (/\]\([^)]*\)/.test(m[1])) res.tocLinked = true;
        res.toc.push(plainLabel(m[1]));
      }
    } else if (r.kind === "takeaways") {
      res.hasTakeaways = true;
      for (const l of body) {
        const m = l.match(/^(?:\d+[.)]|[-*+])\s+(.*)$/);
        if (m && m[1].trim()) res.takeaways.push(m[1].trim());
      }
    }
  }
  return res;
}

/**
 * Fold any "Quick answer" block in the intro back into plain prose: drop a
 * "## Quick answer" heading or a "**Quick answer:**" label, unwrap a fully-bold
 * or blockquoted answer paragraph. The answer text itself stays as the intro.
 */
export function removeQuickAnswer(md: string): string {
  const lines = md.split("\n");
  const firstH2 = lines.findIndex((l) => /^##\s/.test(l.trim()) && !QUICK_HEADING_RE.test(l.trim()));
  const stop = firstH2 === -1 ? lines.length : firstH2;
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (i >= stop) {
      out.push(lines[i]);
      continue;
    }
    let l = lines[i];
    const t = l.trim();
    if (QUICK_HEADING_RE.test(t)) continue;
    const isQuote = /^>\s?/.test(t);
    let s = isQuote ? t.replace(/^>\s?/, "") : t;
    const labelled = /^\*\*\s*quick answer\s*:?\s*\*\*\s*:?\s*/i.test(s) || /^\*\*\s*quick answer\s*:/i.test(s);
    s = s.replace(/^\*\*\s*quick answer\s*:?\s*\*\*\s*:?\s*/i, "").replace(/^\*\*\s*quick answer\s*:\s*/i, "**");
    if (labelled || (isQuote && /^\*\*[^*]+\*\*$/.test(s))) l = s;
    // A paragraph that is entirely bold is the old answer box: unbold it.
    const whole = l.trim().match(/^\*\*([^*]+)\*\*$/);
    if (whole && wordCount(whole[1]) >= 12) l = whole[1].trim();
    if (labelled && /^\*\*[^*]*$/.test(l.trim())) l = l.trim().replace(/^\*\*/, "").replace(/\*\*$/, "");
    out.push(l);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}

/** Remove the guide sections and any legacy TOC section. */
export function stripGuideBlocks(md: string): string {
  const lines = md.split("\n");
  const ranges = sectionRanges(lines);
  const drop = new Set<number>();
  for (const r of ranges) for (let i = r.start; i < r.end; i++) drop.add(i);
  return lines.filter((_, i) => !drop.has(i)).join("\n").replace(/\n{3,}/g, "\n\n");
}

/** Problems with a draft's guide blocks (empty = on spec). */
export function guideIssues(md: string): string[] {
  const { body } = splitSchema(md);
  const issues: string[] = [];
  const g = readGuideBlocks(body);
  if (!g.hasToc || g.toc.length === 0) issues.push(`missing the "${TOC_TITLE}" table of contents`);
  if (g.toc.length > MAX_TOC) issues.push(`"${TOC_TITLE}" has ${g.toc.length} entries (max ${MAX_TOC})`);
  if (g.tocLinked) issues.push(`"${TOC_TITLE}" entries are links (they should be plain text)`);
  if (g.takeaways.length !== TAKEAWAY_COUNT) {
    issues.push(`"${TAKEAWAYS_TITLE}" has ${g.takeaways.length} takeaways (needs exactly ${TAKEAWAY_COUNT})`);
  }
  const long = g.takeaways.filter((t) => wordCount(t) > MAX_TAKEAWAY_WORDS);
  if (long.length) issues.push(`${long.length} takeaway(s) over ${MAX_TAKEAWAY_WORDS} words`);
  if (sectionRanges(body.split("\n")).some((r) => r.kind === "legacy")) issues.push("old-style table of contents");
  if (removeQuickAnswer(body) !== body) issues.push("has a Quick answer block");
  return issues;
}

function renderBlocks(b: GuideBlocks): string {
  const toc = b.toc.map((label, i) => `${i + 1}. ${label}`).join("\n");
  const take = b.takeaways.map((t) => `- ${t}`).join("\n");
  return `## ${TOC_TITLE}\n\n${toc}\n\n## ${TAKEAWAYS_TITLE}\n\n${take}\n`;
}

/** Put the blocks right after the intro (before the first section heading). */
export function withGuideBlocks(md: string, blocks: GuideBlocks): string {
  const { body, schema } = splitSchema(md);
  const clean = stripGuideBlocks(removeQuickAnswer(body));
  const lines = clean.split("\n");
  let at = lines.findIndex((l) => /^##\s/.test(l.trim()));
  if (at === -1) {
    // No sections: after the H1 and its first paragraph.
    const h1 = lines.findIndex((l) => /^#\s/.test(l.trim()));
    at = h1 + 1;
    while (at < lines.length && !lines[at].trim()) at++;
    while (at < lines.length && lines[at].trim()) at++;
  }
  const before = lines.slice(0, at).join("\n").replace(/\s+$/, "");
  const after = lines.slice(at).join("\n").replace(/^\s+/, "");
  const out = `${before}\n\n${renderBlocks(blocks)}\n${after}`.replace(/\n{3,}/g, "\n\n").replace(/\s+$/, "");
  return schema ? `${out}\n\n${schema.replace(/\s+$/, "")}\n` : `${out}\n`;
}

/** A TOC entry as plain text: no numbering, link syntax, bold or trailing period. */
function plainLabel(s: string): string {
  return s
    .replace(/^\d+[.)]\s*/, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[[\]*_`]/g, "")
    .replace(/[.;:,]+$/, "")
    .trim();
}

/** Plain, deduped TOC labels, max 6. */
function cleanToc(toc: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of toc) {
    const label = plainLabel(raw);
    if (!label || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    out.push(label);
    if (out.length === MAX_TOC) break;
  }
  return out;
}

function cleanTakeaway(t: string): string {
  let s = t.replace(/^[-*+]\s+|^\d+[.)]\s+/, "").replace(/\*\*/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").trim();
  if (s && !/[.!?]$/.test(s)) s += ".";
  return s;
}

const SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    toc: { type: "array", items: { type: "string" } },
    takeaways: { type: "array", items: { type: "string" } },
  },
  required: ["toc", "takeaways"],
};

async function generateBlocks(title: string, body: string, retryNote = ""): Promise<GuideBlocks> {
  const heads = sectionHeadings(body);
  const article = stripGuideBlocks(removeQuickAnswer(body));
  return structured<GuideBlocks>({
    model: MODELS.grader,
    effort: "low",
    maxTokens: 4000,
    system:
      "You write the two navigation boxes at the top of a blog article: a table of contents and the key takeaways. You only restate what the article says.",
    prompt: `ARTICLE TITLE: ${title}

SECTION HEADINGS:
${heads.map((h) => `- ${h.text}${h.level === 3 ? " (sub-section)" : ""}`).join("\n")}

Return:
1. "toc": ${Math.min(MAX_TOC, Math.max(3, heads.filter((h) => h.level === 2).length))} entries at most ${MAX_TOC}, in article order, covering the main content sections of the article (leave out the FAQ, "About the author" and brand/why-choose-us sections). Each is a short, plain, reader-friendly name for a section (it need not match the heading word for word; Title Case; plain text only: no links, no numbering, no trailing punctuation).
2. "takeaways": EXACTLY ${TAKEAWAY_COUNT} key takeaways. Each is ONE complete plain sentence of 8 to ${MAX_TAKEAWAY_WORDS} words (never more than ${MAX_TAKEAWAY_WORDS}), ending with a period. Each states one concrete, useful point the article itself makes (no new facts, numbers, laws or claims that are not in the article). No bold, no links, no bullet characters, no "Quick answer". Vary the openings; do not start two takeaways with the same word. Warm, plain language for a family planning a memorial.
${retryNote ? `\nYOUR LAST ATTEMPT WAS REJECTED: ${retryNote}. Fix exactly that.\n` : ""}
ARTICLE:
${article.slice(0, 40000)}`,
    schema: SCHEMA,
  });
}

/** Deterministic blocks for offline mode (no AI): TOC from the H2s, takeaways
 *  from each section's first sentence, clipped. */
function offlineBlocks(body: string): GuideBlocks {
  const heads = sectionHeadings(body).filter((h) => h.level === 2).slice(0, MAX_TOC);
  const sentences = stripGuideBlocks(body)
    .replace(/^#.*$/gm, "")
    .replace(/[*_`>]/g, "")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => wordCount(s) >= 6);
  const takeaways = sentences.slice(0, TAKEAWAY_COUNT).map((s) => {
    const w = s.split(/\s+/).slice(0, MAX_TAKEAWAY_WORDS).join(" ").replace(/[,;:]$/, "");
    return /[.!?]$/.test(w) ? w : `${w}.`;
  });
  return { toc: heads.map((h) => h.text), takeaways };
}

/**
 * Return the draft with on-spec guide blocks: up to 6 working TOC links and
 * exactly 5 takeaways of at most 15 words, placed after the intro, with no
 * Quick answer block. Already-valid blocks are kept (re-rendered canonically);
 * otherwise they're rebuilt with one small structured call (one retry).
 */
export async function ensureGuideBlocks(md: string, opts: { title: string }): Promise<string> {
  const { body } = splitSchema(md);
  const ids = new Set(sectionHeadings(body).map((h) => h.id));
  if (ids.size === 0) return md; // nothing to navigate (malformed draft) — leave it

  const current = readGuideBlocks(body);
  const toc = cleanToc(current.toc);
  const takeaways = current.takeaways.map(cleanTakeaway);
  const takeawaysOk =
    takeaways.length === TAKEAWAY_COUNT && takeaways.every((t) => wordCount(t) <= MAX_TAKEAWAY_WORDS);
  if (toc.length > 0 && takeawaysOk) {
    const out = withGuideBlocks(md, { toc, takeaways });
    return out;
  }

  if (!aiEnabled()) return withGuideBlocks(md, offlineBlocks(body));

  let best: GuideBlocks | null = null;
  let note = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const g = await generateBlocks(opts.title, body, note);
    const t = cleanToc(g.toc);
    const k = g.takeaways.map(cleanTakeaway).filter(Boolean);
    const long = k.filter((s) => wordCount(s) > MAX_TAKEAWAY_WORDS);
    const candidate = { toc: t, takeaways: k };
    if (t.length > 0 && k.length === TAKEAWAY_COUNT && long.length === 0) return withGuideBlocks(md, candidate);
    best = candidate;
    note = [
      t.length === 0 ? "the table of contents was empty" : "",
      k.length !== TAKEAWAY_COUNT ? `you returned ${k.length} takeaways, not ${TAKEAWAY_COUNT}` : "",
      long.length ? `these takeaways are over ${MAX_TAKEAWAY_WORDS} words: ${long.map((s) => `"${s}"`).join("; ")}` : "",
    ]
      .filter(Boolean)
      .join("; ");
  }

  // Still off-spec after a retry: keep what's valid, fill the TOC from the
  // headings, and drop over-long takeaways rather than ship a broken box.
  const fallbackToc = best && best.toc.length ? best.toc : offlineBlocks(body).toc;
  const fallbackTake = (best?.takeaways ?? []).filter((s) => wordCount(s) <= MAX_TAKEAWAY_WORDS).slice(0, TAKEAWAY_COUNT);
  console.warn(`[guide] "${opts.title}": blocks still off-spec after retry (${note})`);
  return withGuideBlocks(md, { toc: fallbackToc, takeaways: fallbackTake });
}

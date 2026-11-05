// The "copy package" for a Ready blog: everything the operator needs to publish
// it by hand in Shopify (publishing from the engine is off).
//
// - Body HTML with no H1 (Shopify shows the title itself), without the
//   "In this guide" and "What to know first" sections, and with no schema.
// - Those two lists on their own.
// - SEO title of at most 60 characters.
// - A real meta description of 150–160 characters (a sentence, not a question).
// - Byline choices from the store's REAL Shopify authors only.
// - The hero image as WebP, 1200px wide, under 200 KB (see heroWebp).
// - Optional schema (JSON-LD), kept separate from the body.
// - Lines that may hold an invented person, for a human to check.

import { prisma } from "@/lib/db";
import { structured, MODELS } from "@/lib/ai/claude";
import { aiEnabled } from "@/lib/env";
import { markdownToHtml } from "@/lib/cms/markdown";
import { readGuideBlocks, stripGuideBlocks } from "@/lib/agents/guide-blocks";
import { stripJsonLdBlocks, buildSchemaJsonLd } from "@/lib/agents/finalize";
import { stripAuthorSections, inventedPeopleFlags } from "@/lib/agents/no-invented-people";
import { getLivePosts } from "@/lib/pipeline/live-posts";

export const SEO_TITLE_MAX = 60;
export const META_MIN = 150;
export const META_MAX = 160;

export interface CopyPackage {
  draftId: string;
  title: string;
  handle: string;
  bodyHtml: string;
  toc: string[];
  takeaways: string[];
  seoTitle: string;
  metaDescription: string;
  byline: { authors: string[]; note: string };
  schemaJsonLd: string;
  hasHero: boolean;
  checks: { label: string; ok: boolean }[];
  flags: { line: string; why: string }[];
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90)
    .replace(/-+$/g, "");
}

/** The article body for pasting: no H1, no guide sections, no schema, no author sections. */
export function copyBodyMarkdown(bodyMd: string): string {
  const clean = stripAuthorSections(stripGuideBlocks(stripJsonLdBlocks(bodyMd)));
  return clean
    .split("\n")
    .filter((l) => !/^#\s+/.test(l.trim())) // every H1 ("# Title")
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function copyBodyHtml(bodyMd: string): string {
  return markdownToHtml(copyBodyMarkdown(bodyMd))
    .replace(/<h1\b[^>]*>[\s\S]*?<\/h1>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/(\s*\n){3,}/g, "\n\n")
    .trim();
}

/** Plain text of the article's opening, for a fallback description. */
function introText(bodyMd: string): string {
  return copyBodyMarkdown(bodyMd)
    .replace(/```[\s\S]*?```/g, " ")
    .split(/\n\s*\n/)
    .filter((p) => p.trim() && !/^\s*(#|>|[-*]\s|\d+\.\s|\|)/.test(p))
    .map((p) =>
      p
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
        .replace(/[*_`]/g, "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .join(" ");
}

function faqQuestions(bodyMd: string): string[] {
  return [...bodyMd.matchAll(/^(?:#{3,4}\s+|\*\*)(.+\?)\**\s*$/gm)].map((m) => m[1].trim().toLowerCase());
}

export function seoTitleOk(t: string): boolean {
  return t.trim().length >= 15 && t.trim().length <= SEO_TITLE_MAX;
}

export function metaOk(m: string, bodyMd: string): boolean {
  const t = m.trim();
  if (t.length < META_MIN || t.length > META_MAX) return false;
  if (/\?\s*$/.test(t)) return false; // a description, not a question
  const qs = faqQuestions(bodyMd);
  return !qs.some((q) => t.toLowerCase().startsWith(q.slice(0, 40)));
}

/** Shorten a title to ≤60 characters at a word boundary. */
export function fitSeoTitle(title: string): string {
  const t = title.trim().replace(/\s+/g, " ");
  if (t.length <= SEO_TITLE_MAX) return t;
  // Prefer the part before a colon/dash when it stands on its own.
  const head = t.split(/\s*[:|–—-]\s+/)[0];
  if (head.length >= 25 && head.length <= SEO_TITLE_MAX) return head;
  let cut = t.slice(0, SEO_TITLE_MAX);
  const sp = cut.lastIndexOf(" ");
  if (sp > 30) cut = cut.slice(0, sp);
  return cut.replace(/[\s,;:.\-–—|&]+$/, "").replace(/\s+(and|or|the|a|an|to|of|for|with|in|on)$/i, "").trim();
}

const TRAILING_STOP = /\s+(?:a|an|and|are|as|at|be|but|by|for|from|here|how|if|in|is|it|of|on|or|so|that|the|this|to|was|what|when|where|which|while|who|why|with|you|your)$/i;

/**
 * Deterministic description from the intro (used offline, or when the model
 * misses the length twice): whole sentences when they land in 150–160
 * characters, otherwise whole words up to 160 ending in "…", never a question.
 */
export function fitMeta(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const sentences = flat.match(/[^.!?]+[.!?]+(?=\s|$)/g) ?? [flat];
  let joined = "";
  for (const sent of sentences) {
    const next = `${joined} ${sent.trim()}`.trim();
    if (next.length > META_MAX) break;
    joined = next;
    if (joined.length >= META_MIN && !/\?$/.test(joined)) return joined;
  }
  // No sentence ends inside the window: whole words up to 159 characters, then
  // trim dangling little words while staying at 150+, then end with "…".
  const words = flat.split(" ");
  let cut = "";
  for (const w of words) {
    const next = cut ? `${cut} ${w}` : w;
    if (next.length > META_MAX - 1) break;
    cut = next;
  }
  for (let i = 0; i < 4; i++) {
    const shorter = cut.replace(TRAILING_STOP, "");
    if (shorter === cut || shorter.length < META_MIN) break;
    cut = shorter;
  }
  cut = cut.replace(/[\s,;:–—?-]+$/, "");
  return /[.!]$/.test(cut) ? cut : `${cut}…`;
}

async function writeSeoFields(title: string, bodyMd: string): Promise<{ seoTitle: string; metaDescription: string }> {
  const fallback = { seoTitle: fitSeoTitle(title), metaDescription: fitMeta(introText(bodyMd)) };
  if (!aiEnabled()) return fallback;
  const article = copyBodyMarkdown(bodyMd).slice(0, 6000);
  let note = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await structured<{ seoTitle: string; metaDescription: string }>({
        model: MODELS.extract,
        cheap: true,
        maxTokens: 800,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: { seoTitle: { type: "string" }, metaDescription: { type: "string" } },
          required: ["seoTitle", "metaDescription"],
        },
        prompt:
          `Write the Shopify SEO fields for this blog article.\n` +
          `- seoTitle: at most ${SEO_TITLE_MAX} characters, leads with the main search phrase, no brand name unless it fits, no clickbait.\n` +
          `- metaDescription: ${META_MIN}–${META_MAX} characters (count them), one or two plain sentences that summarize what the reader will learn and why it helps. ` +
          `It must be a statement, NOT a question, and not copied from the FAQ. No quotes, no emoji, no people's names.\n` +
          `${note}\nTITLE: ${title}\n\nARTICLE:\n${article}`,
      });
      const seoTitle = r.seoTitle.trim().replace(/\s+/g, " ");
      const metaDescription = r.metaDescription.trim().replace(/\s+/g, " ");
      const titleGood = seoTitleOk(seoTitle);
      const metaGood = metaOk(metaDescription, bodyMd);
      if (titleGood && metaGood) return { seoTitle, metaDescription };
      note =
        `Your last answer was off: seoTitle had ${seoTitle.length} characters (max ${SEO_TITLE_MAX}); ` +
        `metaDescription had ${metaDescription.length} characters (must be ${META_MIN}–${META_MAX})` +
        `${/\?\s*$/.test(metaDescription) ? " and ended with a question mark" : ""}. Fix it.`;
      if (attempt === 2) {
        return {
          seoTitle: titleGood ? seoTitle : fitSeoTitle(seoTitle || title),
          metaDescription: metaGood ? metaDescription : fitMeta(metaDescription.length > META_MIN ? metaDescription : introText(bodyMd)),
        };
      }
    } catch (e) {
      console.error("[copy-package] SEO fields failed:", e instanceof Error ? e.message : e);
      return fallback;
    }
  }
  return fallback;
}

/**
 * Build (and remember) a draft's copy package. The SEO title and meta
 * description are written once and stored; `refreshSeo` writes them again.
 */
export async function buildCopyPackage(draftId: string, opts: { refreshSeo?: boolean } = {}): Promise<CopyPackage> {
  const draft = await prisma.draft.findUnique({
    where: { id: draftId },
    select: {
      id: true,
      businessId: true,
      title: true,
      bodyMd: true,
      seoTitle: true,
      metaDescription: true,
      heroImageData: true,
      heroImageUrl: true,
      business: { select: { name: true } },
    },
  });
  if (!draft) throw new Error(`Draft ${draftId} not found`);

  let seoTitle = draft.seoTitle ?? "";
  let metaDescription = draft.metaDescription ?? "";
  if (opts.refreshSeo || !seoTitleOk(seoTitle) || !metaOk(metaDescription, draft.bodyMd)) {
    ({ seoTitle, metaDescription } = await writeSeoFields(draft.title, draft.bodyMd));
    await prisma.draft.update({ where: { id: draft.id }, data: { seoTitle, metaDescription } }).catch(() => {});
  }

  const guide = readGuideBlocks(draft.bodyMd);
  const bodyHtml = copyBodyHtml(draft.bodyMd);
  const live = await getLivePosts(draft.businessId).catch(() => null);
  const authors = live?.authors ?? [];
  const byline = {
    authors,
    note: authors.length
      ? "Pick one of the authors already on your Shopify articles. The engine never invents a name."
      : live?.source === "shopify-admin"
        ? "Your Shopify articles have no author names, so leave Shopify's default author."
        : "Author names come from your Shopify articles, which couldn't be read right now. Use an author you already have in Shopify.",
  };
  const schemaJsonLd = buildSchemaJsonLd(copyBodyMarkdown(draft.bodyMd), {
    title: draft.title,
    metaDescription,
    brandName: draft.business.name,
    isoDate: new Date().toISOString().slice(0, 10),
  });

  const checks = [
    { label: "No H1 in the body", ok: !/<h1\b/i.test(bodyHtml) },
    { label: "No “In this guide” / “What to know first” in the body", ok: !/in this guide|what to know first/i.test(bodyHtml.replace(/<[^>]+>/g, " ").slice(0, 4000)) },
    { label: "No schema or code in the body", ok: !/<script|```|"@context"/i.test(bodyHtml) },
    { label: `SEO title ≤ ${SEO_TITLE_MAX} characters (${seoTitle.length})`, ok: seoTitleOk(seoTitle) },
    { label: `Meta description ${META_MIN}–${META_MAX} characters (${metaDescription.length})`, ok: metaOk(metaDescription, draft.bodyMd) },
  ];

  return {
    draftId: draft.id,
    title: draft.title,
    handle: slugify(fitSeoTitle(draft.title)),
    bodyHtml,
    toc: guide.toc,
    takeaways: guide.takeaways,
    seoTitle,
    metaDescription,
    byline,
    schemaJsonLd,
    hasHero: Boolean(draft.heroImageData || draft.heroImageUrl),
    checks,
    flags: inventedPeopleFlags(copyBodyMarkdown(draft.bodyMd)),
  };
}

/**
 * The draft's hero image as WebP, 1200px wide, under 200 KB: quality steps down
 * until it fits. Returns null when the draft has no image (or it can't be fetched).
 */
export async function heroWebp(draftId: string): Promise<{ bytes: Buffer; filename: string } | null> {
  const draft = await prisma.draft.findUnique({
    where: { id: draftId },
    select: { title: true, heroImageData: true, heroImageUrl: true },
  });
  if (!draft) return null;
  let src: Buffer | null = null;
  if (draft.heroImageData) {
    src = Buffer.from(draft.heroImageData.replace(/^data:[^,]+,/, ""), "base64");
  } else if (draft.heroImageUrl) {
    const res = await fetch(draft.heroImageUrl, { signal: AbortSignal.timeout(20000) }).catch(() => null);
    if (res?.ok) src = Buffer.from(await res.arrayBuffer());
  }
  if (!src?.length) return null;

  const sharp = (await import("sharp")).default;
  const LIMIT = 200 * 1024;
  let bytes: Buffer | null = null;
  const encode = (input: Buffer, quality: number) =>
    sharp(input).rotate().resize({ width: 1200 }).webp({ quality, effort: 6, smartSubsample: true }).toBuffer();
  for (const quality of [82, 74, 66, 58, 50, 42, 34, 26, 18]) {
    bytes = await encode(src, quality);
    if (bytes.length < LIMIT) break;
  }
  // A very busy image can still be over: soften fine detail slightly, then
  // encode again (still 1200px wide) until it fits.
  for (const sigma of [0.6, 1.2, 2]) {
    if (!bytes || bytes.length < LIMIT) break;
    const softened = await sharp(src).rotate().resize({ width: 1200 }).blur(sigma).toBuffer();
    for (const quality of [60, 45, 30]) {
      bytes = await encode(softened, quality);
      if (bytes.length < LIMIT) break;
    }
  }
  return bytes ? { bytes, filename: `${slugify(fitSeoTitle(draft.title)) || "hero"}.webp` } : null;
}

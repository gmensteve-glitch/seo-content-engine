// The category-page writer — SEO content for a store's collection pages
// (/collections/metal-caskets, /collections/upright-headstones …), delivered as
// paste-ready blocks. Two LLM stages, both on the BEST tier because this is
// brainstorming + communication:
//   1. brief  — the angle, keyword targets, section plan (what to say)
//   2. draft  — the prose itself, as structured JSON blocks (how to say it)
// Everything factual (prices, products, sizes, materials) comes from the live
// catalog facts handed in; the writer is told it may not state a number that
// isn't there, and a deterministic fact-check enforces it afterwards. What the
// writer knows about the LINE OF BUSINESS (the real laws, the real authorities,
// what a buyer asks) comes from the industry pack in ctx.industry.
// No images — the product grid is the visual.

import { structured, completeText, MODELS } from "@/lib/ai/claude";
import { aiEnabled, dataforseoEnabled, firecrawlEnabled } from "@/lib/env";
import { serpTop, keywordVolumes } from "@/lib/connectors/dataforseo";
import { scrapeMany } from "@/lib/connectors/firecrawl";
import { factsForPrompt, type CatalogFacts } from "@/lib/categories/facts";
import type { IndustryPack } from "@/lib/categories/industry";

export interface LinkTarget {
  title: string;
  url: string;
  kind: "hub" | "collection" | "blog" | "product";
}

export interface CategoryContext {
  businessName: string;
  domain: string;
  businessContext: string; // profile markdown
  brandVoice: string;
  houseRules: string;
  fixNotes: string[];
  collection: {
    title: string;
    handle: string;
    url: string;
    tier: 1 | 2 | 3;
    keywordSeed: string;
    /** For state/regional collections: the place the page is about. */
    locality: string | null;
  };
  facts: CatalogFacts | null;
  links: LinkTarget[]; // the ONLY internal links the writer may use
  /** Store shipping/returns/FAQ policy text — the only source for such claims. */
  policies: string;
  /** What the engine knows about this line of business (laws, authorities, buyer questions). */
  industry: IndustryPack;
}

export interface CategoryBrief {
  primaryKeyword: string;
  secondaryKeywords: string[];
  keywordVolumes: { keyword: string; volume: number | null }[];
  angle: string;
  sections: { heading: string; purpose: string }[];
  questions: string[];
  wordTarget: number;
  competitorsCover: string[];
  competitorUrls: string[];
}

export interface CategoryDraftJson {
  h1: string;
  intro: string;
  sections: { heading: string; bodyMarkdown: string }[];
  comparisonTable: { caption: string; headers: string[]; rows: string[][] } | null;
  faqs: { question: string; answer: string }[];
  whyUs: string;
  relatedGuides: { title: string; url: string }[];
  seoTitle: string;
  metaDescription: string;
}

/** Depth by tier — hubs go deep, colour pages stay short and focused. */
export function tierSpec(tier: 1 | 2 | 3): {
  words: [number, number];
  sections: [number, number];
  faqs: [number, number];
  table: boolean;
  links: [number, number];
} {
  if (tier === 1) return { words: [1500, 2000], sections: [5, 6], faqs: [6, 8], table: true, links: [10, 15] };
  if (tier === 2) return { words: [800, 1200], sections: [4, 5], faqs: [5, 6], table: false, links: [6, 10] };
  return { words: [300, 500], sections: [2, 3], faqs: [3, 4], table: false, links: [3, 5] };
}

// ── Brief (brainstorm) ─────────────────────────────────────────

const BRIEF_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    primaryKeyword: { type: "string" },
    secondaryKeywords: { type: "array", items: { type: "string" } },
    angle: { type: "string" },
    sections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { heading: { type: "string" }, purpose: { type: "string" } },
        required: ["heading", "purpose"],
      },
    },
    questions: { type: "array", items: { type: "string" } },
    competitorsCover: { type: "array", items: { type: "string" } },
  },
  required: ["primaryKeyword", "secondaryKeywords", "angle", "sections", "questions", "competitorsCover"],
};

const BRIEF_SYSTEM = `You are a senior e-commerce SEO strategist planning the editorial content for a store's category (collection) page. Category pages win COMMERCIAL searches ("metal caskets", "oversized caskets") — the shopper is ready to buy. Plan content that answers what a buyer needs to decide, uses the store's real catalog, and out-structures the competing category pages. Never invent products, prices or facts: plan around what the catalog facts contain.`;

function linksForPrompt(links: LinkTarget[]): string {
  if (!links.length) return "(none available yet)";
  return links.map((l) => `- [${l.kind}] ${l.title} — ${l.url}`).join("\n");
}

function offlineBrief(ctx: CategoryContext): CategoryBrief {
  const spec = tierSpec(ctx.collection.tier);
  const kw = ctx.collection.keywordSeed;
  const name = ctx.collection.title;
  const place = ctx.collection.locality;
  const sections = ctx.industry.offlineSections(ctx.collection.tier, name, ctx.businessName);
  const questions = ctx.industry.offlineQuestions(kw, place).slice(0, Math.max(spec.faqs[0], 3));
  return {
    primaryKeyword: kw,
    secondaryKeywords: [`${kw} for sale`, `buy ${kw} online`, `affordable ${kw}`],
    keywordVolumes: [],
    angle: `${kw} direct from ${ctx.businessName} with real catalog prices${place ? `, for families in ${place}` : ""}.`,
    sections,
    questions,
    wordTarget: Math.round((spec.words[0] + spec.words[1]) / 2),
    competitorsCover: [],
    competitorUrls: [],
  };
}

/** Does this SERP result look like a category page (not a blog/article)? */
function looksLikeCategory(url: string): boolean {
  return /\/(collections|category|categories|shop|c|products)\//i.test(url) && !/\/blogs?\//i.test(url);
}

export async function buildCategoryBrief(ctx: CategoryContext): Promise<CategoryBrief> {
  if (!aiEnabled()) return offlineBrief(ctx);
  const spec = tierSpec(ctx.collection.tier);

  // Competitor category pages for the seed keyword — enrichment, never a dependency.
  let competitorUrls: string[] = [];
  let competitorSummary = "";
  if (dataforseoEnabled()) {
    try {
      const serp = await serpTop(ctx.collection.keywordSeed, { limit: 10 });
      const ours = ctx.domain.replace(/^www\./, "");
      competitorUrls = serp
        .filter((r) => looksLikeCategory(r.url) && !r.url.includes(ours))
        .slice(0, 4)
        .map((r) => r.url);
      competitorSummary = serp
        .slice(0, 8)
        .map((r) => `#${r.position} ${r.title} — ${r.url}\n   ${r.description}`)
        .join("\n");
      if (firecrawlEnabled() && competitorUrls.length) {
        const pages = await scrapeMany(competitorUrls.slice(0, 2));
        competitorSummary +=
          "\n\nCOMPETITOR CATEGORY PAGE CONTENT:\n" +
          pages.map((p) => `--- ${p.title} (${p.wordCount} words) ${p.url}\n${p.markdown.slice(0, 3000)}`).join("\n\n");
      }
    } catch (e) {
      console.error("[category-brief] SERP/scrape degraded:", e instanceof Error ? e.message : e);
    }
  }

  let raw: Omit<CategoryBrief, "keywordVolumes" | "wordTarget" | "competitorUrls">;
  try {
    raw = await structured({
      model: MODELS.research,
      effort: "high",
      system: BRIEF_SYSTEM,
      schema: BRIEF_SCHEMA,
      prompt: `STORE: ${ctx.businessName} (${ctx.domain}) — sells ${ctx.industry.label}
BUSINESS CONTEXT:
${ctx.businessContext.slice(0, 4000)}
${ctx.industry.primer ? `\n${ctx.industry.primer}\n` : ""}
COLLECTION PAGE: "${ctx.collection.title}" — ${ctx.collection.url}
Tier: ${ctx.collection.tier} (1 = hub/head term, 2 = sub-collection, 3 = colour/variant/state)
${ctx.collection.locality ? `LOCAL PAGE: this collection is for families in ${ctx.collection.locality} — plan short, place-specific content (delivery there, the rules that really apply, local buyer questions) and link to the hub for the general guide.\n` : ""}Seed keyword: ${ctx.collection.keywordSeed}
Depth for this tier: ${spec.sections[0]}–${spec.sections[1]} sections below the product grid, ${spec.faqs[0]}–${spec.faqs[1]} FAQs, ~${spec.words[0]}–${spec.words[1]} words.

LIVE CATALOG FACTS (the only facts that may be planned around):
${ctx.facts ? factsForPrompt(ctx.facts) : "(catalog not readable — plan generically, no prices)"}

INTERNAL PAGES AVAILABLE TO LINK:
${linksForPrompt(ctx.links)}

SEARCH LANDSCAPE:
${competitorSummary || "(no SERP data — infer from the keyword)"}

Produce the plan: the primary keyword a buyer types (commercial intent, singular/plural as searched), 4–6 secondary keywords, the angle that beats competing category pages, the section plan (heading + one-line purpose; the intro and the FAQ and "Why ${ctx.businessName}" are added automatically so do NOT include them), the buyer questions the FAQ must answer, and what the competitors cover.`,
    });
  } catch (e) {
    console.error("[category-brief] LLM failed, offline brief:", e instanceof Error ? e.message : e);
    return offlineBrief(ctx);
  }

  // Let real search volume pick the primary among the candidates when available.
  let volumes: CategoryBrief["keywordVolumes"] = [];
  let primaryKeyword = raw.primaryKeyword.trim();
  let secondaryKeywords = raw.secondaryKeywords.map((k) => k.trim()).filter(Boolean);
  if (dataforseoEnabled()) {
    try {
      const candidates = [primaryKeyword, ...secondaryKeywords].slice(0, 8);
      const vols = await keywordVolumes(candidates);
      volumes = vols.map((v) => ({ keyword: v.keyword, volume: v.volume }));
      const best = [...vols].filter((v) => v.volume != null).sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))[0];
      if (best && best.keyword && best.keyword !== primaryKeyword) {
        secondaryKeywords = [primaryKeyword, ...secondaryKeywords.filter((k) => k !== best.keyword)];
        primaryKeyword = best.keyword;
      }
    } catch (e) {
      console.error("[category-brief] volumes degraded:", e instanceof Error ? e.message : e);
    }
  }

  return {
    ...raw,
    primaryKeyword,
    secondaryKeywords,
    keywordVolumes: volumes,
    wordTarget: Math.round((spec.words[0] + spec.words[1]) / 2),
    competitorUrls,
  };
}

// ── Draft (communication) ──────────────────────────────────────

const DRAFT_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    h1: { type: "string" },
    intro: { type: "string" },
    sections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { heading: { type: "string" }, bodyMarkdown: { type: "string" } },
        required: ["heading", "bodyMarkdown"],
      },
    },
    comparisonTable: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          properties: {
            caption: { type: "string" },
            headers: { type: "array", items: { type: "string" } },
            rows: { type: "array", items: { type: "array", items: { type: "string" } } },
          },
          required: ["caption", "headers", "rows"],
        },
      ],
    },
    faqs: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { question: { type: "string" }, answer: { type: "string" } },
        required: ["question", "answer"],
      },
    },
    whyUs: { type: "string" },
    relatedGuides: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { title: { type: "string" }, url: { type: "string" } },
        required: ["title", "url"],
      },
    },
    seoTitle: { type: "string" },
    metaDescription: { type: "string" },
  },
  required: [
    "h1",
    "intro",
    "sections",
    "comparisonTable",
    "faqs",
    "whyUs",
    "relatedGuides",
    "seoTitle",
    "metaDescription",
  ],
};

const DRAFT_SYSTEM = `You write the editorial content for e-commerce category pages: the copy above and below a product grid that helps a buyer decide and helps the page rank for its commercial keyword. You write like an experienced, plainspoken practitioner talking to a family under stress — warm, specific, never salesy. You never invent a product, price, measurement, guarantee or delivery timeline: every number you state comes from the catalog facts you are given.`;

function guidance(ctx: CategoryContext): string {
  const spec = tierSpec(ctx.collection.tier);
  const name = ctx.businessName;
  const ind = ctx.industry;
  return `RULES — these are hard requirements:
- LENGTH: ${spec.words[0]}–${spec.words[1]} words across the sections + FAQ + "why us". Do not exceed the upper bound.
- FACTS: every price, size, material, colour and product name must appear in the LIVE CATALOG FACTS. State the price range as it is given there. You MAY reference typical ${ind.venue} / industry pricing as context, but only in a sentence that clearly says it is ${ind.venue} or industry pricing (e.g. "${ind.venue === "cemetery" ? "Monument dealers" : "Funeral homes"} commonly list a comparable ${ind.productNoun} at $X–$Y"), framed as "commonly" / "typically" — never as our price.
- PRICES IN PROSE are whole dollars: "$1,299", "from $999", "$999–$4,999". Never ".99" in running text (the table may show exact prices).
- NO PLACEHOLDERS: this is delivered as finished text. No brackets like [price], no TODOs, no "add …" notes.
- NO IMAGES: text, lists, one table at most. Never reference or embed an image.
- NO TABLE OF CONTENTS, no "jump to" list, no in-page anchor links (#…). The headings are the navigation.
- SAY EACH THING ONCE. The intro is the only summary on the page; the first section must NOT restate it. No "quick answer" or recap paragraph anywhere in the sections. The ${ind.rulesSectionName} explanation appears in full exactly once (in its own section) and may be mentioned in passing at most once more, in a few words. No repeated price ranges, delivery promises, or "factory-direct" lines across sections.
- INTERNAL LINKS: you may link ONLY to URLs in the INTERNAL PAGES list, using the exact URL given, with natural anchor text (a keyword variant, never "click here"). Aim for ${spec.links[0]}–${spec.links[1]} internal links spread across sections. Do not invent any other internal URL.
- AUTHORITY LINKS: ${ind.authorityLinks.length ? `include 2–3 external links, chosen ONLY from this list, inline where the claim is made:\n${ind.authorityLinks.map((l) => `  · ${l.title} — ${l.url}`).join("\n")}\n  No other external URLs, ever.` : "none — no external links on this page."}
- ${ind.legalRule} ${ind.legalDontSay}
- E-E-A-T WITHOUT INVENTION: never claim reviewers, advisors, licensed staff, credentials, "years in the industry", or that anyone "verifies" or "cross-checks" the content unless the BUSINESS CONTEXT says so. Authority comes from the real catalog facts, the linked standards, and plain practitioner-grade explanation. Write in the brand's voice as the store, not as a named person.
- SHIPPING / RETURNS / GUARANTEES: state ONLY what appears in STORE POLICY below (quote its terms faithfully — e.g. if it says free standard shipping, you may say that). If STORE POLICY is empty or silent on a point, say the detail is confirmed when you order. Never invent delivery times, carriers, packing steps, or return terms. ${ind.promiseRule}
- ANSWER-FIRST: the intro's first two sentences answer the search directly (what this is, the real price range, what happens next). Every section's first sentence answers that section's question on its own, quotable out of context.
- H1: ≤ 70 characters, leads with the primary keyword, then the ${name} promise. It replaces the store's current H1.
- INTRO: 60–90 words, plain prose (no markdown, no links), for ABOVE the product grid.
- SECTIONS: ${spec.sections[0]}–${spec.sections[1]} H2 sections for BELOW the grid, following the brief's plan. Body is Markdown (paragraphs, short lists; links in [text](url) form using only allowed URLs). Include ${ind.requiredSections}.
- COMPARISON TABLE: ${spec.table ? `include ONE table (${ind.tableHint}), 3–5 columns, 3–6 rows, only facts from the catalog.` : "set to null for this tier."}
- FAQ: ${spec.faqs[0]}–${spec.faqs[1]} real buyer questions from the brief, each answered in 2–4 self-contained sentences (prime AI-answer material). Plain text answers, no links.
- WHY US: 90–160 words on ${name} — what the BUSINESS CONTEXT and STORE POLICY actually support (direct pricing, the guarantee, the turnaround, the tone from the brand voice). No hype, no invented claims.
- RELATED GUIDES: 2–3 items chosen ONLY from the [blog] entries in INTERNAL PAGES (title + exact URL). Empty list if none.
- SEO TITLE: ≤ 60 characters, keyword first, brand last ("… – ${name}"). META DESCRIPTION: ≤ 155 characters, the answer + the differentiator, written to earn the click.
- BAN: "in conclusion", "it's important to note", "when it comes to", "navigate", "delve", "in today's world", em-dash overuse, reflexive hedging.
- TONE: ${ctx.brandVoice ? "the brand voice below" : "compassionate, practical, plainspoken"}.
${ctx.collection.locality ? `\n${ind.localRules(ctx.collection.locality, name)}` : ""}${ctx.houseRules ? `\nHOUSE RULES (learned from the operator's feedback — obey):\n${ctx.houseRules}` : ""}${
    ctx.fixNotes.length ? `\nOPERATOR NOTES FOR THIS PAGE (obey exactly):\n${ctx.fixNotes.map((n) => `- ${n}`).join("\n")}` : ""
  }`;
}

function offlineDraft(ctx: CategoryContext, brief: CategoryBrief): CategoryDraftJson {
  const f = ctx.facts;
  const money = (n: number | null | undefined) => (n == null ? "" : `$${n.toLocaleString("en-US")}`);
  const range = f?.priceMin != null && f?.priceMax != null ? `${money(f.priceMin)}–${money(f.priceMax)}` : "";
  const name = ctx.businessName;
  const kw = brief.primaryKeyword;
  const title = ctx.collection.title.replace(/\b\w/g, (c) => c.toUpperCase());
  const collections = ctx.links.filter((l) => l.kind !== "blog").slice(0, 4);
  const blogs = ctx.links.filter((l) => l.kind === "blog").slice(0, 3);
  const spec = tierSpec(ctx.collection.tier);
  return {
    h1: `${title} — Direct from ${name}`,
    intro: `${title} from ${name} are sold direct${range ? `, priced from ${range}` : ""}, with every option listed on the product page and the details confirmed when you order. Browse the collection below; the guide underneath explains how to choose, what to confirm with your ${ctx.industry.venue} first, and what happens after you order.`,
    sections: brief.sections.map((s, i) => ({
      heading: s.heading,
      bodyMarkdown:
        i === 0 && collections.length
          ? `${s.purpose}. See also ${collections.map((c) => `[${c.title}](${c.url})`).join(", ")}.`
          : `${s.purpose}.${range && /price/i.test(s.heading) ? ` At ${name}, ${kw} run ${range} in the current catalog.` : ""}`,
    })),
    comparisonTable: null,
    faqs: brief.questions.slice(0, spec.faqs[1]).map((q) => ({
      question: q,
      answer:
        /cost|price/i.test(q) && range
          ? `${title} at ${name} currently range from ${range}, sold direct.`
          : /deliver|fast|long/i.test(q)
            ? `Timing is confirmed when you order; ${name} states its shipping terms on its policy pages.`
            : `Every option is listed on the product page, and a real person at ${name} confirms the details when you order.`,
    })),
    whyUs: `${name} sells direct, so families pay the maker's price instead of a middleman's markup. Every order is handled with care and confirmed by a real person.`,
    relatedGuides: blogs.map((b) => ({ title: b.title, url: b.url })),
    seoTitle: `${title} for Sale – ${name}`.slice(0, 60),
    metaDescription: `Shop ${kw} direct from ${name}${range ? ` from ${range}` : ""}. Real catalog prices, every option listed, details confirmed when you order.`.slice(0, 155),
  };
}

export async function writeCategoryDraft(ctx: CategoryContext, brief: CategoryBrief): Promise<CategoryDraftJson> {
  if (!aiEnabled()) return offlineDraft(ctx, brief);
  return structured<CategoryDraftJson>({
    model: MODELS.writer,
    effort: "high",
    maxTokens: 28000,
    system: DRAFT_SYSTEM,
    schema: DRAFT_SCHEMA,
    prompt: `STORE: ${ctx.businessName} (${ctx.domain}) — sells ${ctx.industry.label}
BRAND VOICE:
${ctx.brandVoice || "(none provided)"}

BUSINESS CONTEXT:
${ctx.businessContext.slice(0, 3000)}
${ctx.industry.primer ? `\n${ctx.industry.primer}\n` : ""}
COLLECTION PAGE: "${ctx.collection.title}" — ${ctx.collection.url} (tier ${ctx.collection.tier})

BRIEF:
Primary keyword: ${brief.primaryKeyword}
Secondary keywords: ${brief.secondaryKeywords.join(", ")}
Angle: ${brief.angle}
Section plan:
${brief.sections.map((s) => `- ${s.heading} — ${s.purpose}`).join("\n")}
Buyer questions for the FAQ:
${brief.questions.map((q) => `- ${q}`).join("\n")}
${brief.competitorsCover.length ? `Competitors cover: ${brief.competitorsCover.join("; ")}` : ""}

LIVE CATALOG FACTS (the only source of numbers and product names):
${ctx.facts ? factsForPrompt(ctx.facts) : "(catalog not readable — state NO prices or product names)"}

STORE POLICY (the only source for shipping / returns / guarantee claims):
${ctx.policies || "(none readable — say details are confirmed at order)"}

INTERNAL PAGES (the only internal URLs you may link):
${linksForPrompt(ctx.links)}

${guidance(ctx)}

Write the page now as the JSON blocks.`,
  });
}

/** Where a highlighted passage lives in the draft. */
export type PassageTarget =
  | { kind: "h1" }
  | { kind: "intro" }
  | { kind: "section"; index: number }
  | { kind: "faq"; index: number }
  | { kind: "whyUs" };

/**
 * Targeted fix — rewrite ONE passage the operator highlighted, per their
 * instruction, leaving everything else untouched. Returns the replacement in
 * the passage's own format (plain text for h1/intro/FAQ answers, Markdown for
 * sections and why-us).
 */
export async function rewriteCategoryPassage(
  ctx: CategoryContext,
  draft: CategoryDraftJson,
  target: PassageTarget,
  selectedText: string,
  instruction: string,
): Promise<string> {
  const current =
    target.kind === "h1"
      ? draft.h1
      : target.kind === "intro"
        ? draft.intro
        : target.kind === "section"
          ? draft.sections[target.index]?.bodyMarkdown ?? ""
          : target.kind === "faq"
            ? draft.faqs[target.index]?.answer ?? ""
            : draft.whyUs;
  const format =
    target.kind === "section" || target.kind === "whyUs"
      ? "Markdown (paragraphs, short lists, links in [text](url) form — only allowed URLs)"
      : "plain text, no markdown, no links";
  if (!aiEnabled()) return current;
  const out = await completeText({
    model: MODELS.writer,
    effort: "medium",
    maxTokens: 6000,
    system: DRAFT_SYSTEM,
    prompt: `The operator highlighted a passage in a category page and asked for a change. Rewrite ONLY this passage. Keep everything they didn't mention exactly as it is — same facts, same links, same length unless the instruction says otherwise.

INSTRUCTION FROM THE OPERATOR:
${instruction}

HIGHLIGHTED TEXT (the part they mean):
"${selectedText}"

THE FULL PASSAGE THIS TEXT IS IN (return a replacement for ALL of it, in ${format}):
${current}

LIVE CATALOG FACTS (the only source of numbers and product names):
${ctx.facts ? factsForPrompt(ctx.facts) : "(catalog not readable — state NO prices or product names)"}

STORE POLICY (the only source for shipping / returns / guarantee claims):
${ctx.policies || "(none readable — say details are confirmed at order)"}

INTERNAL PAGES (the only internal URLs you may link):
${linksForPrompt(ctx.links)}

Rules that still apply: whole-dollar prices in prose; no placeholders; no images; no table of contents; no invented reviewers or credentials. ${ctx.industry.legalRule} ${ctx.industry.legalDontSay} Return ONLY the replacement passage — no preamble, no quotes, no code fences.`,
  });
  return out.replace(/^```[a-z]*\n?|```$/g, "").trim();
}

/**
 * Editor pass — the same model reads the draft as a demanding editor and
 * tightens it: removes every repeated fact or promise, the recap paragraphs,
 * the second and third statements of the Funeral Rule, hedging and filler;
 * brings it to the target length. It may not add facts, prices or links.
 */
export async function tightenCategoryDraft(ctx: CategoryContext, brief: CategoryBrief, draft: CategoryDraftJson): Promise<CategoryDraftJson> {
  if (!aiEnabled()) return draft;
  const spec = tierSpec(ctx.collection.tier);
  return structured<CategoryDraftJson>({
    model: MODELS.writer,
    effort: "medium",
    maxTokens: 28000,
    system: `You are a demanding editor for e-commerce category pages. You cut repetition and filler ruthlessly and keep every concrete fact. You never add a fact, number, product, link or claim that isn't already in the draft.`,
    schema: DRAFT_SCHEMA,
    prompt: `Edit this category-page draft. Target ${spec.words[0]}–${spec.words[1]} words total (sections + FAQ + why-us).

DO:
- Remove every repeated fact, price range, delivery promise or "factory-direct" line — each appears ONCE, in its best place.
- Remove any recap / "quick answer" / summary paragraph in the sections (the intro is the only summary).
- Keep the full "${ctx.industry.rulesSectionName}" explanation in ONE section only; elsewhere at most a few-word mention.
- Cut hedging ("generally", "typically" where not needed), throat-clearing, and filler sentences that carry no fact.
- Keep the intro at 60–90 words, plain prose, no links.
- Keep every internal and authority link that's there (do not add any).
- Whole-dollar prices in prose.
- Keep headings, the table, and the FAQ questions unless a FAQ answer merely repeats another.

DON'T:
- Add facts, prices, products, claims or links.
- Change the meaning of any sentence.

Primary keyword: ${brief.primaryKeyword}

CURRENT DRAFT (JSON):
${JSON.stringify(draft)}

Return the tightened draft as the same JSON shape.`,
  });
}

/** Fix a draft against concrete issues (fact-check failures, grader feedback). */
export async function reviseCategoryDraft(
  ctx: CategoryContext,
  brief: CategoryBrief,
  draft: CategoryDraftJson,
  issues: string[],
): Promise<CategoryDraftJson> {
  if (!aiEnabled()) return draft;
  return structured<CategoryDraftJson>({
    model: MODELS.writer,
    effort: "medium",
    maxTokens: 28000,
    system: DRAFT_SYSTEM,
    schema: DRAFT_SCHEMA,
    prompt: `Revise this category-page draft to fix EVERY issue listed. Keep everything that isn't flagged. Return the complete corrected JSON.

ISSUES TO FIX:
${issues.map((i) => `- ${i}`).join("\n")}

LIVE CATALOG FACTS (the only source of numbers and product names):
${ctx.facts ? factsForPrompt(ctx.facts) : "(catalog not readable — state NO prices or product names)"}

STORE POLICY (the only source for shipping / returns / guarantee claims):
${ctx.policies || "(none readable — say details are confirmed at order)"}

INTERNAL PAGES (the only internal URLs you may link):
${linksForPrompt(ctx.links)}

${guidance(ctx)}

CURRENT DRAFT (JSON):
${JSON.stringify(draft)}`,
  });
}

// Turn the writer's JSON blocks into the paste-ready deliverable, and check it.
// Deterministic — no LLM. The fact-check is the hard gate that makes "every
// number comes from the catalog" true in practice, not just in the prompt.

import crypto from "node:crypto";
import { markdownToHtml } from "@/lib/cms/markdown";
import type { CategoryDraftJson, LinkTarget } from "@/lib/agents/category-writer";
import type { CatalogFacts } from "@/lib/categories/facts";

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function md(s: string): string {
  // Strip anything the renderer might lift into a <script> (JSON-LD fences) —
  // schema ships separately as its own block.
  return markdownToHtml(s).replace(/<script[\s\S]*?<\/script>/gi, "").trim();
}

/** Internal links stay in the same tab; the renderer's target=_blank is only
 *  right for external sources. */
function sameTabInternal(html: string, domain: string): string {
  const ours = domain.replace(/^www\./, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return html.replace(
    new RegExp(`<a href="((?:https?:\\/\\/(?:www\\.)?${ours}[^"]*)|\\/[^"]*)"[^>]*>`, "g"),
    '<a href="$1">',
  );
}

/** URL-safe id for a heading, so any in-page anchor resolves on the live page. */
export function headingId(text: string): string {
  return text
    .toLowerCase()
    .replace(/&[a-z]+;/g, " ")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
}

/** Strip any table-of-contents / "jump to" list the writer slipped in. */
function stripJumpLists(mdText: string): string {
  return mdText
    .split(/\n{2,}/)
    .filter((block) => {
      const lines = block.trim().split("\n");
      const isList = lines.length >= 2 && lines.every((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l));
      const anchors = (block.match(/\]\(#[^)]+\)/g) ?? []).length;
      return !(isList && anchors >= Math.max(2, lines.length - 1)) && !/^\s*(jump to|in this guide|table of contents|contents)\s*:?\s*$/i.test(block.trim());
    })
    .join("\n\n");
}

/** The below-the-grid HTML: sections, table, FAQ, why-us, related guides. */
export function assembleBodyHtml(draft: CategoryDraftJson, businessName: string, domain = ""): string {
  const parts: string[] = [];
  // Heading ids must be unique on the page (two "Prices" headings → prices, prices-2).
  const used = new Set<string>(["faq", "related-guides"]);
  const uniqueId = (text: string): string => {
    const base = headingId(text) || "section";
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
    used.add(id);
    return id;
  };
  for (const s of draft.sections) {
    const heading = s.heading.trim();
    const body = md(stripJumpLists(s.bodyMarkdown));
    // A section that was only a table of contents has nothing left — drop it.
    if (!body.replace(/<[^>]+>/g, "").trim()) continue;
    parts.push(`<h2 id="${uniqueId(heading)}">${escapeHtml(heading)}</h2>\n${body}`);
  }
  const t = draft.comparisonTable;
  if (t && t.headers.length && t.rows.length) {
    const head = t.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("");
    const rows = t.rows
      .map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`)
      .join("\n");
    const cap = t.caption.trim() || "At a glance";
    parts.push(
      `<h2 id="${uniqueId(cap)}">${escapeHtml(cap)}</h2>\n<table>\n<thead><tr>${head}</tr></thead>\n<tbody>\n${rows}\n</tbody>\n</table>`,
    );
  }
  if (draft.faqs.length) {
    parts.push(
      `<h2 id="faq">Frequently asked questions</h2>\n` +
        draft.faqs
          .map((f) => `<h3>${escapeHtml(f.question.trim())}</h3>\n<p>${escapeHtml(f.answer.trim())}</p>`)
          .join("\n"),
    );
  }
  if (draft.whyUs.trim()) {
    parts.push(`<h2 id="why-${headingId(businessName)}">Why ${escapeHtml(businessName)}</h2>\n${md(stripJumpLists(draft.whyUs))}`);
  }
  if (draft.relatedGuides.length) {
    parts.push(
      `<h2 id="related-guides">Related guides</h2>\n<ul>\n` +
        draft.relatedGuides
          .map((g) => `<li><a href="${escapeHtml(g.url)}">${escapeHtml(g.title)}</a></li>`)
          .join("\n") +
        `\n</ul>`,
    );
  }
  const html = parts.join("\n\n").replace(/(\s*\n){3,}/g, "\n\n").trim();
  return domain ? sameTabInternal(html, domain) : html;
}

/** FAQPage JSON-LD for the theme (visible FAQ is in the body regardless). */
export function faqJsonLd(faqs: CategoryDraftJson["faqs"]): string {
  const doc = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.question.trim(),
      acceptedAnswer: { "@type": "Answer", text: f.answer.trim() },
    })),
  };
  return JSON.stringify(doc, null, 2);
}

/** A markdown rendition for the rubric grader. */
export function draftAsMarkdown(draft: CategoryDraftJson, businessName: string): string {
  const out: string[] = [`# ${draft.h1}`, "", draft.intro, ""];
  for (const s of draft.sections) out.push(`## ${s.heading}`, "", s.bodyMarkdown, "");
  if (draft.comparisonTable) {
    const t = draft.comparisonTable;
    out.push(`## ${t.caption}`, "", `| ${t.headers.join(" | ")} |`, `| ${t.headers.map(() => "---").join(" | ")} |`);
    for (const r of t.rows) out.push(`| ${r.join(" | ")} |`);
    out.push("");
  }
  out.push("## Frequently asked questions", "");
  for (const f of draft.faqs) out.push(`### ${f.question}`, "", f.answer, "");
  out.push(`## Why ${businessName}`, "", draft.whyUs, "");
  return out.join("\n");
}

function visibleText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

const MARKET_CUE =
  /(funeral home|funeral-home|monument dealer|dealers?|cemeter|industry|average|typical|commonly|national|median|elsewhere|retail|markup|mortuar|setting fee|installation)/i;

/** Is a market-pricing cue within a few words of this position in the sentence? */
function framedAsMarket(sentence: string, at: number): boolean {
  const window = sentence.slice(Math.max(0, at - 90), at + 90);
  return MARKET_CUE.test(window);
}

/** A comparable form of a URL for allow-list checks: no origin/www, no query, no trailing slash. */
function pathKey(href: string, ours: string): string {
  let s = href.trim();
  try {
    if (/^https?:\/\//i.test(s)) {
      const u = new URL(s);
      const host = u.hostname.replace(/^www\./, "");
      s = host === ours ? u.pathname : `${host}${u.pathname}`;
    }
  } catch {
    /* keep as-is */
  }
  return s.replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();
}

/**
 * The hard gate. Returns the list of problems (empty = passed):
 *  - leftover placeholders / TODOs / image references
 *  - a dollar amount that isn't in the live catalog range AND isn't framed as
 *    funeral-home/industry pricing in the same sentence
 *  - an internal link to a URL that isn't in the allowed list
 *  - block sizes outside spec (H1/title/meta lengths, intro words, FAQ count)
 */
export function factCheck(
  draft: CategoryDraftJson,
  bodyHtml: string,
  facts: CatalogFacts | null,
  allowed: LinkTarget[],
  domain: string,
  minFaqs: number,
  authorityLinks: { url: string }[] = [],
): string[] {
  const issues: string[] = [];
  const text = [draft.h1, draft.intro, visibleText(bodyHtml), draft.seoTitle, draft.metaDescription].join("\n");

  // Placeholders + images
  if (/\[[^\]\n]{1,60}\]/.test(`${draft.h1}\n${draft.intro}\n${visibleText(bodyHtml)}`)) {
    issues.push("bracketed placeholder text left in the copy (e.g. [price]) — replace with the real value or remove");
  }
  if (/\b(TODO|TBD|lorem ipsum|add your|insert )\b/i.test(text)) issues.push("leftover TODO/placeholder wording");
  if (/<img\b|!\[/i.test(bodyHtml)) issues.push("an image reference — category copy is text-only");

  // Dollar amounts vs the catalog
  const sentences = text.split(/(?<=[.!?])\s+/);
  const inRange = (n: number) => {
    if (!facts || facts.priceMin == null || facts.priceMax == null) return false;
    if (facts.prices.some((p) => Math.abs(p - n) <= 1)) return true;
    return n >= facts.priceMin * 0.95 && n <= facts.priceMax * 1.05;
  };
  const bad = new Set<string>();
  for (const s of sentences) {
    for (const m of s.matchAll(/\$\s?([\d,]+(?:\.\d{1,2})?)\s*(k\b)?/gi)) {
      const n = Number(m[1].replace(/,/g, "")) * (m[2] ? 1000 : 1);
      if (!Number.isFinite(n)) continue;
      if (inRange(n)) continue;
      if (framedAsMarket(s, m.index ?? 0)) continue; // clearly framed as market/industry pricing
      bad.add(`$${m[1]}${m[2] ?? ""}`);
    }
  }
  if (bad.size) {
    issues.push(
      `price(s) not in the live catalog and not framed as industry/market pricing: ${[...bad].join(", ")}${
        facts && facts.priceMin != null ? ` (catalog range is $${facts.priceMin}–$${facts.priceMax})` : " (no catalog data — state no prices)"
      }`,
    );
  }
  if (!facts || facts.priceMin == null) {
    // No catalog data: any of OUR prices is an invention.
    const ours = sentences.filter((s) => /\$\s?[\d,]+/.test(s) && !MARKET_CUE.test(s));
    if (ours.length && !bad.size) issues.push("prices stated but the catalog could not be read — remove them");
  }

  // Links: internal only from the allowed list; external only to the authority set.
  const ours = domain.replace(/^www\./, "");
  const allowedSet = new Set(allowed.map((l) => pathKey(l.url, ours)));
  const authorityHosts = authorityLinks
    .map((l) => {
      try {
        return new URL(l.url).hostname.replace(/^www\./, "");
      } catch {
        return "";
      }
    })
    .filter(Boolean);
  const ids = new Set([...bodyHtml.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of bodyHtml.matchAll(/href="([^"]+)"/g)) {
    const href = m[1].replace(/\/+$/, "");
    if (href.startsWith("#")) {
      if (!ids.has(href.slice(1))) issues.push(`in-page link to a heading that doesn't exist: ${href}`);
      continue;
    }
    const internal = href.startsWith("/") || href.includes(ours);
    if (internal) {
      if (!allowedSet.has(pathKey(href, ours))) issues.push(`internal link to a page not in the allowed list: ${href}`);
      continue;
    }
    if (/^https?:\/\//i.test(href)) {
      let host = "";
      try {
        host = new URL(href).hostname.replace(/^www\./, "");
      } catch {
        host = "";
      }
      if (!authorityHosts.some((h) => host === h || host.endsWith(`.${h}`))) {
        issues.push(`external link outside the approved authority sources: ${href}`);
      }
    }
  }

  // Whole-dollar prices in prose (tables may keep cents).
  const prose = [draft.intro, ...draft.sections.map((s) => s.bodyMarkdown), draft.whyUs, ...draft.faqs.map((f) => f.answer)].join("\n");
  const cents = [...prose.matchAll(/\$[\d,]+\.\d{2}\b/g)].map((m) => m[0]);
  if (cents.length) issues.push(`prices in prose should be whole dollars (found ${[...new Set(cents)].slice(0, 4).join(", ")})`);

  // Invented expertise claims.
  if (/\b(cross-?checks?|reviewed by (our|a) |our (licensed|certified) |years? (of|in) (the )?(funeral|industry)|funeral[- ]service advisor)\b/i.test(prose)) {
    issues.push("an unsupported expertise/reviewer claim — remove it; authority comes from linked standards and catalog facts");
  }

  // Block sizes
  if (draft.h1.length > 70) issues.push(`H1 is ${draft.h1.length} chars (max 70)`);
  if (draft.seoTitle.length > 60) issues.push(`SEO title is ${draft.seoTitle.length} chars (max 60)`);
  if (draft.metaDescription.length > 155) issues.push(`meta description is ${draft.metaDescription.length} chars (max 155)`);
  const introWords = draft.intro.trim().split(/\s+/).filter(Boolean).length;
  if (introWords < 45 || introWords > 110) issues.push(`intro is ${introWords} words (aim 60–90)`);
  if (draft.faqs.length < minFaqs) issues.push(`only ${draft.faqs.length} FAQs (need at least ${minFaqs})`);
  if (!draft.sections.length) issues.push("no sections");

  return issues;
}

export function wordCount(draft: CategoryDraftJson): number {
  return draftAsMarkdown(draft, "").split(/\s+/).filter(Boolean).length;
}

/** Plain-text rendition of the body HTML, for the Text tab / a text-only paste. */
export function bodyAsText(html: string): string {
  return html
    .replace(/<h2[^>]*>/gi, "\n\n")
    .replace(/<\/h2>/gi, "\n")
    .replace(/<h3[^>]*>/gi, "\n")
    .replace(/<\/h3>/gi, "\n")
    .replace(/<\/p>|<\/li>|<br\s*\/?>|<\/tr>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<\/t[dh]>/gi, "  ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Internal + authority link counts in the assembled body. */
export function linkCounts(bodyHtml: string, domain: string): { internal: number; external: number } {
  const ours = domain.replace(/^www\./, "");
  let internal = 0;
  let external = 0;
  for (const m of bodyHtml.matchAll(/href="([^"]+)"/g)) {
    const href = m[1];
    if (href.startsWith("/") || href.includes(ours)) internal += 1;
    else if (/^https?:\/\//i.test(href)) external += 1;
  }
  return { internal, external };
}

/** Fingerprint of the paste-ready blocks, to detect drift after "mark live". */
export function snapshotHash(blocks: {
  h1: string | null;
  intro: string | null;
  bodyHtml: string | null;
  seoTitle: string | null;
  metaDescription: string | null;
}): string {
  return crypto
    .createHash("sha1")
    .update([blocks.h1, blocks.intro, blocks.bodyHtml, blocks.seoTitle, blocks.metaDescription].join(" "))
    .digest("hex");
}

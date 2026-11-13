// Brand-neutral blog mode (a pack with blogGenericOnly — the pet store, owner
// request 2026-11-13). Every blog is a fully generic, helpful guide for the
// reader: nothing about the store, its products, prices, sizes, tiers or
// shipping, no other brand's or company's products, and no links at all.
//
// Enforced at every step: the brief and writer get GENERIC_BLOG_RULES, every
// revise gets them too, every write/revise is cleaned (all links removed,
// flagged lines rewritten) and every grade fails a draft that still breaks
// them (genericViolations + brandMentions).

import { structured, MODELS } from "@/lib/ai/claude";
import { aiEnabled } from "@/lib/env";

export const GENERIC_BLOG_RULES = `BRAND-NEUTRAL GUIDE — THESE RULES OVERRIDE EVERYTHING ELSE:
- Write a fully GENERIC, genuinely helpful guide for pet owners. It is NOT about any store.
- Never mention our store or brand, our products, our prices, our sizes or size range, product tiers, our shipping, delivery or returns, and never "we/our/us" as a seller. No calls to action, no "shop", "order", "buy from us" or "contact us".
- Never mention, name or recommend any other brand's, company's, store's or retailer's products or services.
- NO links of any kind: no external links (not even to animal-welfare or veterinary organizations) and no internal links. Plain text only.
- No invented people, experts, quotes, testimonials or stories. Never say where any product is made or who makes it, never mention engraving, never mention free shipping.
- General facts a pet owner needs (how to measure a pet, what to check before a home burial, how cremation works, typical cost ranges across the market framed as "typically") are welcome.`;

/** Remove every link: Markdown links and images become their text, HTML anchors their text, bare URLs are dropped. */
export function stripAllLinks(md: string): string {
  return md
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]*)\)/g, "$1")
    .replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, "$1")
    .replace(/<(https?:\/\/[^>\s]+)>/gi, "")
    .replace(/\bhttps?:\/\/[^\s)>\]"']+/gi, "")
    .replace(/\bwww\.[a-z0-9-]+\.[a-z.]{2,}[^\s)>\]"']*/gi, "")
    .replace(/[ \t]{2,}/g, " ");
}

export function hasLinks(md: string): boolean {
  return /\]\([^)]*\)|<a\b|https?:\/\/|\bwww\.[a-z0-9-]+\./i.test(md);
}

const RETAILERS =
  /\b(?:amazon|chewy|petco|petsmart|etsy|walmart|costco|target|ebay|wayfair|home depot|lowe'?s|tractor supply|banfield|vca|bluepearl|rainbow bridge pet|paws ?& ?remember|perfect memorials|in the light urns|urns northwest)\b/i;

function sentences(text: string): string[] {
  return text
    .split("\n")
    .flatMap((line) => line.split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/))
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("```"));
}

/** Deterministic rule breaks: our brand, selling language, prices of ours, our sizes, shipping, tiers, ®/™, known retailers, links. */
export function genericViolations(md: string, brandNames: string[] = []): { line: string; why: string }[] {
  const brands = brandNames
    .map((b) => b.trim().toLowerCase())
    .filter((b) => b.length >= 4)
    .map((b) => b.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, ""));
  const rules: { re: RegExp; why: string; also?: RegExp }[] = [
    { re: /\b(?:we|our|us)\b[^.]*\b(?:sell|offer|carry|ship|stock|make|craft|design|caskets?|urns?|necklaces?|jewel(?:le)?ry|products?|collection|store|shop|catalog(?:ue)?|prices?|sizes?)\b/i, why: "talks about our store or products" },
    { re: /\b(?:shop|order|buy|browse|add to cart|check ?out|visit (?:our|the) (?:store|shop|site))\b[^.]*\b(?:our|now|today|here|online)\b/i, why: "a call to action" },
    { re: /\b(?:contact us|call us|email us|reach out to us)\b/i, why: "a call to action" },
    { re: /\b(?:free )?(?:shipping|delivery|returns?|refunds?)\b/i, also: /\b(?:we|our|us|free|ships?|your order|orders? (?:ship|arrive))\b/i, why: "talks about shipping, delivery or returns" },
    { re: /\btiers?\b|\bgood[ ,/-]+better[ ,/-]+best\b/i, why: "talks about product tiers" },
    { re: /\b(?:20|24|28|32|40|52)\s*(?:"|”|″|-?\s?in(?:ch(?:es)?)?\b)/i, also: /\b(?:caskets?|coffins?|boxes?)\b/i, why: "lists casket sizes from our catalog" },
    { re: /[®™]/, why: "names a brand (®/™)" },
    { re: RETAILERS, why: "names another brand, store or retailer" },
    { re: /\]\([^)]*\)|<a\b|https?:\/\/|\bwww\.[a-z0-9-]+\./i, why: "contains a link" },
  ];
  const out: { line: string; why: string }[] = [];
  for (const s of sentences(md)) {
    const low = s.toLowerCase();
    const brand = brands.find((b) => low.includes(b) || low.replace(/\s+/g, "").includes(b.replace(/\s+/g, "")));
    if (brand) {
      out.push({ line: s.length > 220 ? `${s.slice(0, 217)}…` : s, why: "names our store/brand" });
      continue;
    }
    for (const r of rules) {
      if (r.re.test(s) && (!r.also || r.also.test(s))) {
        out.push({ line: s.length > 220 ? `${s.slice(0, 217)}…` : s, why: r.why });
        break;
      }
    }
    if (out.length >= 15) break;
  }
  return out;
}

/**
 * Brand, company, store or commercial product names the article mentions (a
 * small model call; deterministic rules can't know every brand). Generic
 * product types and public bodies don't count. Returns [] offline.
 */
export async function brandMentions(md: string): Promise<{ name: string; line: string }[]> {
  if (!aiEnabled()) return [];
  const { mentions } = await structured<{ mentions: { name: string; line: string }[] }>({
    model: MODELS.extract,
    cheap: true,
    maxTokens: 1500,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        mentions: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: { name: { type: "string" }, line: { type: "string" } },
            required: ["name", "line"],
          },
        },
      },
      required: ["mentions"],
    },
    prompt:
      `List every BRAND, COMPANY, STORE, RETAILER, MANUFACTURER or named commercial PRODUCT this article mentions ` +
      `(for example a pet-supply store, a casket or urn maker, a cremation company, a named product line). ` +
      `Do NOT list generic product types (pet casket, urn, cremation necklace), animals, places, or government and ` +
      `non-profit public bodies. For each, give the name and the sentence it appears in. Return an empty list if there are none.\n\nARTICLE:\n${md.slice(0, 24000)}`,
  });
  return (mentions ?? []).filter((m) => m.name?.trim());
}

/** Everything that breaks the brand-neutral rules (deterministic + model brand check). */
export async function genericProblems(md: string, brandNames: string[]): Promise<{ line: string; why: string }[]> {
  const fixed = genericViolations(md, brandNames);
  const named = await brandMentions(md).catch((e) => {
    console.error("[generic] brand check failed:", e instanceof Error ? e.message : e);
    return [] as { name: string; line: string }[];
  });
  return [...fixed, ...named.map((m) => ({ line: m.line.slice(0, 220), why: `names a brand or company (${m.name})` }))];
}

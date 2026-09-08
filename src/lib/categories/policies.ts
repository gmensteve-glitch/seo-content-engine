// Store policy facts — shipping, returns, FAQ — scraped from the store's public
// policy pages. Category copy may state shipping/returns facts ONLY from here,
// so "free standard shipping" is either on the store's own policy page or it
// doesn't get written. Deterministic; no LLM.

import { siteBase } from "@/lib/categories/discover";

const UA = "Mozilla/5.0 (compatible; ContentEngineBot/1.0)";

const CANDIDATES: { path: string; label: string }[] = [
  { path: "/policies/shipping-policy", label: "Shipping policy" },
  { path: "/policies/refund-policy", label: "Refund / returns policy" },
  { path: "/pages/shipping", label: "Shipping page" },
  { path: "/pages/shipping-policy", label: "Shipping page" },
  { path: "/pages/faq", label: "FAQ" },
  { path: "/pages/faqs", label: "FAQ" },
  { path: "/pages/frequently-asked-questions", label: "FAQ" },
];

function textOf(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<(nav|header|footer)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/p>|<\/li>|<\/h[1-6]>|<\/tr>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

/** Fetch and flatten the store's policy pages. Returns "" if none are readable. */
export async function fetchStorePolicies(domain: string): Promise<string> {
  const base = siteBase(domain);
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const c of CANDIDATES) {
    if (seen.has(c.label) && c.label !== "Shipping page") continue;
    try {
      const res = await fetch(`${base}${c.path}`, {
        headers: { "User-Agent": UA, Accept: "text/html" },
        redirect: "follow",
      });
      if (!res.ok) continue;
      const text = textOf(await res.text());
      // A policy page has real body text; a 200 that's just chrome is skipped.
      if (text.length < 200) continue;
      seen.add(c.label);
      parts.push(`## ${c.label} (${c.path})\n${text.slice(0, 2500)}`);
    } catch {
      /* unreachable page — skip */
    }
  }
  return parts.join("\n\n").slice(0, 7000);
}

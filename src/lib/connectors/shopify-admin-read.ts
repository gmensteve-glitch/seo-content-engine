// Read-only access to a store's catalog and content through its Shopify Admin
// connection, for when the PUBLIC site can't be read (a store still behind its
// password page before launch). Everything here is GET only; publishing stays
// governed by src/lib/cms/publishing.ts. Returns null/"" when the store has no
// working Shopify connection, so callers just keep their public-site result.

import { prisma } from "@/lib/db";
import { encryptionEnabled } from "@/lib/env";
import { getCmsAdapter, type CmsAdapter } from "@/lib/cms";
import { freshCmsConfig } from "@/lib/cms/connector-config";

export async function adminReaderFor(businessId: string): Promise<CmsAdapter | null> {
  if (!encryptionEnabled()) return null;
  const connector = await prisma.connector
    .findUnique({ where: { businessId_type: { businessId, type: "SHOPIFY" } } })
    .catch(() => null);
  if (!connector || connector.status !== "CONNECTED") return null;
  try {
    return getCmsAdapter("shopify", await freshCmsConfig(connector));
  } catch (e) {
    console.error("[admin-read] no Shopify reader:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Flatten HTML to text (for policies/pages fed to prompts). */
export function htmlText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
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

/** Store policy text from the Admin API (legal policies + shipping/FAQ/returns pages). "" if none. */
export async function adminPolicyText(businessId: string): Promise<string> {
  const reader = await adminReaderFor(businessId);
  if (!reader) return "";
  const parts: string[] = [];
  const policies = (await reader.listPoliciesRead?.().catch(() => [])) ?? [];
  for (const p of policies) {
    if (!/refund|return|shipping|terms/i.test(`${p.title} ${p.handle}`)) continue;
    const text = htmlText(p.body);
    if (text.length >= 120) parts.push(`## ${p.title} (Shopify policy)\n${text.slice(0, 2500)}`);
  }
  const pages = (await reader.listPagesRead?.().catch(() => [])) ?? [];
  for (const p of pages) {
    if (!/shipping|faq|frequently|return|refund|delivery/i.test(`${p.title} ${p.handle}`)) continue;
    const text = htmlText(p.body);
    if (text.length < 200 || /555-1234|lorem ipsum|\[insert|your company name/i.test(text)) continue;
    parts.push(`## ${p.title} (/pages/${p.handle})\n${text.slice(0, 2500)}`);
  }
  return parts.join("\n\n").slice(0, 7000);
}

/** A plain-text picture of the store for brand intake: shop pages, collections, products. */
export async function adminIntakeCorpus(businessId: string): Promise<string> {
  const reader = await adminReaderFor(businessId);
  if (!reader) return "";
  const sections: string[] = [];
  const pages = (await reader.listPagesRead?.().catch(() => [])) ?? [];
  for (const p of pages.filter((x) => /about|story|mission|faq|shipping|contact/i.test(`${x.title} ${x.handle}`)).slice(0, 5)) {
    sections.push(`PAGE: ${p.title}\n${htmlText(p.body).slice(0, 2500)}`);
  }
  const cols = (await reader.listCollectionsRead?.().catch(() => [])) ?? [];
  if (cols.length) {
    sections.push(
      `COLLECTIONS:\n${cols
        .map(
          (c) =>
            `- ${c.title}${c.products_count != null ? ` (${c.products_count} products)` : ""}${
              c.body_html ? `: ${htmlText(c.body_html).slice(0, 200)}` : ""
            }`,
        )
        .join("\n")}`,
    );
    const lines: string[] = [];
    for (const c of cols.slice(0, 6)) {
      const products = (await reader.listCollectionProductsRead?.(c.handle).catch(() => null)) ?? [];
      for (const p of products.slice(0, 8)) {
        const prices = p.variants.map((v) => Number(v.price)).filter((n) => n > 0);
        const range = prices.length
          ? ` $${Math.min(...prices)}${Math.max(...prices) !== Math.min(...prices) ? `–$${Math.max(...prices)}` : ""}`
          : "";
        lines.push(`- ${p.title}${p.product_type ? ` [${p.product_type}]` : ""}${range}: ${htmlText(p.body_html).slice(0, 200)}`);
      }
    }
    if (lines.length) sections.push(`PRODUCTS (sample):\n${lines.join("\n")}`);
  }
  const policy = await adminPolicyText(businessId);
  if (policy) sections.push(`POLICIES:\n${policy.slice(0, 3000)}`);
  return sections.join("\n\n---\n\n");
}

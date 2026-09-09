// Catalog facts for a collection — the ONLY source of prices, product names,
// sizes, materials and colours the category writer may state. Pulled from the
// store's public /collections/<handle>/products.json, so it's always the live
// catalog and never a guess. Everything here is deterministic (no LLM). Which
// attributes are worth mining (steel gauges for caskets, W x D x H sizes and
// base widths for headstones) comes from the industry pack.

import { siteBase } from "@/lib/categories/discover";
import { INDUSTRIES, type IndustryPack } from "@/lib/categories/industry";

export interface CatalogProduct {
  title: string;
  handle: string;
  url: string;
  type: string;
  price: number | null;
  priceMax: number | null;
  tags: string[];
  blurb: string;
}

export interface CatalogFacts {
  handle: string;
  productCount: number;
  priceMin: number | null;
  priceMax: number | null;
  /** Every distinct variant price seen (for exact-match fact checks). */
  prices: number[];
  products: CatalogProduct[]; // a representative sample
  /** Attributes mined from titles/tags/descriptions. */
  gauges: string[]; // caskets: "18-gauge", "20-gauge" (kept for older stored facts)
  materials: string[]; // "granite", "stainless steel", "solid oak", ...
  widths: string[]; // caskets: '28"', '32"' (kept for older stored facts)
  colours: string[];
  /** Industry-specific named attributes, e.g. "Sizes in the catalog" → ['24" x 12" x 4"', …]. */
  attributes?: { label: string; values: string[] }[];
  /** Style words present in the catalog (flat, slant, upright, companion …). */
  styles?: string[];
  /** Variant option values (e.g. Stone: Black, Grey, Bahama Blue). */
  options?: { name: string; values: string[] }[];
  fetchedAt: string;
}

const UA = "Mozilla/5.0 (compatible; ContentEngineBot/1.0)";

type ShopifyProduct = {
  title?: string;
  handle?: string;
  product_type?: string;
  tags?: string[] | string;
  body_html?: string;
  variants?: Array<{ price?: string; compare_at_price?: string | null }>;
  options?: Array<{ name?: string; values?: string[] }>;
};

function strip(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8243;|&Prime;/g, "″")
    .replace(/\s+/g, " ")
    .trim();
}

function num(v: unknown): number | null {
  const n = Number(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

function uniq(xs: string[]): string[] {
  return [...new Set(xs.map((x) => x.trim()).filter(Boolean))];
}

/** Live catalog facts for one collection. Returns null if the site can't be read. */
export async function fetchCatalogFacts(
  domain: string,
  handle: string,
  pack: IndustryPack = INDUSTRIES.general,
): Promise<CatalogFacts | null> {
  const base = siteBase(domain);
  const products: ShopifyProduct[] = [];
  for (let page = 1; page <= 4; page++) {
    let raw: string;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    try {
      const res = await fetch(`${base}/collections/${handle}/products.json?limit=250&page=${page}`, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: ctrl.signal,
      });
      if (!res.ok) break;
      raw = await res.text();
    } catch {
      break;
    } finally {
      clearTimeout(timer);
    }
    let data: { products?: ShopifyProduct[] };
    try {
      data = JSON.parse(raw) as { products?: ShopifyProduct[] };
    } catch {
      break;
    }
    const batch = data.products ?? [];
    if (batch.length === 0) break;
    products.push(...batch);
  }
  if (products.length === 0 && !(await siteReachable(base))) return null;

  const prices: number[] = [];
  const items: CatalogProduct[] = [];
  const corpus: string[] = [];
  const optionValues = new Map<string, Set<string>>();
  for (const p of products) {
    const variantPrices = (p.variants ?? []).map((v) => num(v.price)).filter((n): n is number => n != null);
    prices.push(...variantPrices);
    const tags = Array.isArray(p.tags) ? p.tags : String(p.tags ?? "").split(",");
    const blurb = strip(String(p.body_html ?? "")).slice(0, 220);
    const title = strip(String(p.title ?? ""));
    const h = String(p.handle ?? "").trim();
    corpus.push(`${title} ${tags.join(" ")} ${strip(String(p.body_html ?? ""))}`.toLowerCase());
    for (const o of p.options ?? []) {
      const name = String(o.name ?? "").trim();
      if (!name || /^title$/i.test(name)) continue;
      const set = optionValues.get(name.toLowerCase()) ?? new Set<string>();
      for (const v of o.values ?? []) if (v && !/^default title$/i.test(v)) set.add(v);
      optionValues.set(name.toLowerCase(), set);
    }
    items.push({
      title,
      handle: h,
      url: `${base}/products/${h}`,
      type: String(p.product_type ?? "").trim(),
      price: variantPrices.length ? Math.min(...variantPrices) : null,
      priceMax: variantPrices.length ? Math.max(...variantPrices) : null,
      tags: uniq(tags).slice(0, 8),
      blurb,
    });
  }

  const text = corpus.join(" \n ");
  const gauges = uniq([...text.matchAll(/\b(16|18|20|22)\s*-?\s*(?:ga|gauge)\b/g)].map((m) => `${m[1]}-gauge`)).sort();
  const materials = pack.materialWords.filter((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text));
  const widths =
    pack.key === "caskets"
      ? uniq([...text.matchAll(/\b(2[4-9]|3\d|4\d|5\d)\s*(?:"|”|-?\s?inch(?:es)?)\b/g)].map((m) => `${m[1]}"`)).sort(
          (a, b) => parseInt(a) - parseInt(b),
        )
      : [];
  const colours = pack.colourWords.filter((w) => new RegExp(`\\b${w}\\b`).test(text));
  const styles = pack.styleWords.filter((w) => new RegExp(`\\b${w}\\b`).test(text));
  const attributes = pack.attributeExtractors
    .map((ex) => ({
      label: ex.label,
      values: uniq([...text.matchAll(new RegExp(ex.regex.source, ex.regex.flags.includes("g") ? ex.regex.flags : `${ex.regex.flags}g`))].map(ex.format)).slice(0, 24),
    }))
    .filter((a) => a.values.length);
  const options = [...optionValues.entries()]
    .filter(([, v]) => v.size > 0)
    .map(([name, v]) => ({ name: name.replace(/\b\w/g, (c) => c.toUpperCase()), values: [...v].sort() }));

  // Representative sample: spread across the price range, cheapest first.
  const sorted = [...items].filter((i) => i.price != null).sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
  const step = Math.max(1, Math.floor(sorted.length / 12));
  const sample = sorted.filter((_, i) => i % step === 0).slice(0, 12);

  const distinct = uniq(prices.map((p) => String(p))).map(Number).sort((a, b) => a - b);
  return {
    handle,
    productCount: items.length,
    priceMin: distinct.length ? distinct[0] : null,
    priceMax: distinct.length ? distinct[distinct.length - 1] : null,
    prices: distinct,
    products: sample.length ? sample : items.slice(0, 12),
    gauges,
    materials: uniq(materials),
    widths,
    colours: uniq(colours),
    attributes,
    styles: uniq(styles),
    options,
    fetchedAt: new Date().toISOString(),
  };
}

async function siteReachable(base: string): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(base, { method: "HEAD", headers: { "User-Agent": UA }, signal: ctrl.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Compact, prompt-ready rendering of the facts. */
export function factsForPrompt(f: CatalogFacts): string {
  const money = (n: number | null) => (n == null ? "—" : `$${n.toLocaleString("en-US")}`);
  const lines = [
    `Products in this collection: ${f.productCount}`,
    `Price range (live catalog): ${money(f.priceMin)} – ${money(f.priceMax)}`,
    f.gauges.length ? `Steel gauges offered: ${f.gauges.join(", ")}` : "",
    f.materials.length ? `Materials mentioned in the catalog: ${f.materials.join(", ")}` : "",
    f.widths.length ? `Widths mentioned: ${f.widths.join(", ")}` : "",
    f.colours.length ? `Colours/finishes: ${f.colours.join(", ")}` : "",
    f.styles?.length ? `Styles present: ${f.styles.join(", ")}` : "",
    ...(f.attributes ?? []).map((a) => `${a.label}: ${a.values.join(", ")}`),
    ...(f.options ?? []).map((o) => `Option "${o.name}": ${o.values.join(", ")}`),
    "",
    "Representative products (title — price — type):",
    ...f.products.map(
      (p) => `- ${p.title} — ${money(p.price)}${p.priceMax && p.priceMax !== p.price ? ` to ${money(p.priceMax)}` : ""}${p.type ? ` — ${p.type}` : ""}`,
    ),
  ];
  return lines.filter((l) => l !== "").join("\n");
}

// Catalog facts for a collection — the ONLY source of prices, product names,
// gauges, widths and materials the category writer may state. Pulled from the
// store's public /collections/<handle>/products.json, so it's always the live
// catalog and never a guess. Everything here is deterministic (no LLM).

import { siteBase } from "@/lib/categories/discover";

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
  gauges: string[]; // "18-gauge", "20-gauge", "16-gauge"
  materials: string[]; // "stainless steel", "solid oak", ...
  widths: string[]; // '28"', '32"'
  colours: string[];
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
};

const MATERIAL_WORDS = [
  "stainless steel",
  "steel",
  "bronze",
  "copper",
  "solid oak",
  "oak",
  "mahogany",
  "cherry",
  "walnut",
  "maple",
  "poplar",
  "pine",
  "veneer",
  "bamboo",
  "willow",
  "seagrass",
  "cardboard",
  "cloth-covered",
  "fiberglass",
  "marble",
  "ceramic",
  "brass",
  "aluminum",
  "wood",
  "metal",
];

const COLOUR_WORDS = [
  "black",
  "white",
  "silver",
  "gold",
  "blue",
  "navy",
  "red",
  "pink",
  "purple",
  "green",
  "brown",
  "grey",
  "gray",
  "copper",
  "bronze",
  "champagne",
  "orange",
  "ivory",
  "natural",
];

function strip(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
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
export async function fetchCatalogFacts(domain: string, handle: string): Promise<CatalogFacts | null> {
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
    products.push(...batch);
    if (batch.length < 250) break;
  }
  if (products.length === 0 && !(await siteReachable(base))) return null;

  const prices: number[] = [];
  const items: CatalogProduct[] = [];
  const corpus: string[] = [];
  for (const p of products) {
    const variantPrices = (p.variants ?? []).map((v) => num(v.price)).filter((n): n is number => n != null);
    prices.push(...variantPrices);
    const tags = Array.isArray(p.tags) ? p.tags : String(p.tags ?? "").split(",");
    const blurb = strip(String(p.body_html ?? "")).slice(0, 220);
    const title = String(p.title ?? "").trim();
    const h = String(p.handle ?? "").trim();
    corpus.push(`${title} ${tags.join(" ")} ${blurb}`.toLowerCase());
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
  const gauges = uniq(
    [...text.matchAll(/\b(16|18|20|22)\s*-?\s*(?:ga|gauge)\b/g)].map((m) => `${m[1]}-gauge`),
  ).sort();
  const materials = MATERIAL_WORDS.filter((w) => text.includes(w));
  const widths = uniq(
    [...text.matchAll(/\b(2[4-9]|3\d|4\d|5\d)\s*(?:"|”|-?\s?inch(?:es)?)\b/g)].map((m) => `${m[1]}"`),
  ).sort((a, b) => parseInt(a) - parseInt(b));
  const colours = COLOUR_WORDS.filter((w) => new RegExp(`\\b${w}\\b`).test(text));

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
    "",
    "Representative products (title — price — type):",
    ...f.products.map(
      (p) => `- ${p.title} — ${money(p.price)}${p.priceMax && p.priceMax !== p.price ? ` to ${money(p.priceMax)}` : ""}${p.type ? ` — ${p.type}` : ""}`,
    ),
  ];
  return lines.filter((l) => l !== "").join("\n");
}

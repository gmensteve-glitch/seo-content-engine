// "No Shopify connection" mode: a store with no Shopify connector can have its
// product list uploaded or pasted (JSON or CSV) on the Connectors page. The
// list stands in for Shopify / the public site wherever the engine needs
// product facts, collections or a picture of the store for brand intake. A
// store in this mode can also have the titles of its existing blog posts
// pasted (or none: "no posts yet"), so idea generation and the duplicate check
// still run. Nothing here talks to Shopify.
//
// FILE FORMAT (both forms take the same fields; only `title` is required):
//   handle       URL handle, e.g. "pet-casket-24" (made from the title if empty)
//   title        product name
//   type         product type, e.g. "Pet Casket"
//   collection   collection name(s), e.g. "Pet Caskets"; several separated by ";"
//                (defaults to the type)
//   price        one price, or one per size/variant separated by "|": 89|109|129
//   options      "Size: 20 in|24 in|28 in; Color: Black|White"
//                (JSON may also use {"Size": ["20 in", "24 in"]})
//   description  a short description
// JSON: an array of objects, or {"products": [...]}. CSV: a header row, then
// one product per row; quote fields that contain commas.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { AdminCollection, AdminProduct } from "@/lib/cms/types";

export interface ManualProduct {
  handle: string;
  title: string;
  type: string;
  collections: string[];
  prices: number[];
  options: { name: string; values: string[] }[];
  description: string;
}

export interface ParseResult {
  products: ManualProduct[];
  errors: string[];
  warnings: string[];
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/['’"″”]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** RFC-4180-ish CSV: quoted fields, "" escapes, commas/newlines inside quotes. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim())) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim())) rows.push(row);
  return rows;
}

const ALIASES: Record<string, keyof RawRow> = {
  handle: "handle", "url handle": "handle", url_handle: "handle", slug: "handle",
  title: "title", name: "title", "product title": "title",
  type: "type", "product type": "type", product_type: "type",
  collection: "collection", collections: "collection", category: "collection",
  price: "price", prices: "price",
  options: "options", sizes: "options", "sizes/options": "options", variants: "options",
  description: "description", "short description": "description", desc: "description",
};

type RawRow = { handle?: unknown; title?: unknown; type?: unknown; collection?: unknown; price?: unknown; options?: unknown; description?: unknown };

function prices(v: unknown): number[] {
  const parts = Array.isArray(v) ? v : String(v ?? "").split(/[|;]/);
  return parts
    .map((p) => Number(String(p).replace(/[^0-9.]/g, "")))
    .filter((n) => Number.isFinite(n) && n > 0)
    .map((n) => Math.round(n * 100) / 100);
}

function options(v: unknown): { name: string; values: string[] }[] {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return Object.entries(v as Record<string, unknown>)
      .map(([name, vals]) => ({
        name: name.trim(),
        values: (Array.isArray(vals) ? vals : String(vals).split("|")).map((x) => String(x).trim()).filter(Boolean),
      }))
      .filter((o) => o.name && o.values.length);
  }
  const s = String(v ?? "").trim();
  if (!s) return [];
  return s
    .split(";")
    .map((part) => {
      const [name, rest] = part.includes(":") ? [part.slice(0, part.indexOf(":")), part.slice(part.indexOf(":") + 1)] : ["Option", part];
      return { name: name.trim(), values: rest.split("|").map((x) => x.trim()).filter(Boolean) };
    })
    .filter((o) => o.name && o.values.length);
}

function toProduct(r: RawRow, at: string, out: ParseResult): ManualProduct | null {
  const title = String(r.title ?? "").trim();
  if (!title) {
    out.errors.push(`${at}: no title — skipped`);
    return null;
  }
  const type = String(r.type ?? "").trim();
  const collections = (Array.isArray(r.collection) ? r.collection.map(String) : String(r.collection ?? "").split(";"))
    .map((c) => c.trim())
    .filter(Boolean);
  const p: ManualProduct = {
    handle: slugify(String(r.handle ?? "").trim() || title),
    title,
    type,
    collections: collections.length ? collections : type ? [type] : [],
    prices: prices(r.price),
    options: options(r.options),
    description: String(r.description ?? "").replace(/\s+/g, " ").trim().slice(0, 1000),
  };
  if (!p.prices.length) out.warnings.push(`${at} “${title}”: no price`);
  if (!p.collections.length) out.warnings.push(`${at} “${title}”: no collection or type, so it won't appear on a category page`);
  return p;
}

/** Parse a pasted/uploaded product list (JSON or CSV). */
export function parseCatalog(text: string): ParseResult {
  const out: ParseResult = { products: [], errors: [], warnings: [] };
  const t = text.replace(/^﻿/, "").trim();
  if (!t) {
    out.errors.push("The file is empty.");
    return out;
  }
  if (t.startsWith("[") || t.startsWith("{")) {
    let data: unknown;
    try {
      data = JSON.parse(t);
    } catch (e) {
      out.errors.push(`Not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
      return out;
    }
    const list = Array.isArray(data) ? data : (data as { products?: unknown }).products;
    if (!Array.isArray(list)) {
      out.errors.push('JSON must be an array of products, or {"products": [...]}.');
      return out;
    }
    list.forEach((item, i) => {
      if (!item || typeof item !== "object") return void out.errors.push(`item ${i + 1}: not an object — skipped`);
      const raw: RawRow = {};
      for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
        const key = ALIASES[k.trim().toLowerCase()];
        if (key) raw[key] = v;
      }
      const p = toProduct(raw, `item ${i + 1}`, out);
      if (p) out.products.push(p);
    });
  } else {
    const rows = parseCsv(t);
    const header = (rows.shift() ?? []).map((h) => ALIASES[h.trim().toLowerCase()]);
    if (!header.includes("title")) {
      out.errors.push(`The CSV header needs a "title" column (found: ${rows.length ? "" : "no rows; "}${header.filter(Boolean).join(", ") || "nothing recognised"}).`);
      return out;
    }
    rows.forEach((cells, i) => {
      const raw: RawRow = {};
      header.forEach((key, j) => {
        if (key) raw[key] = cells[j];
      });
      const p = toProduct(raw, `row ${i + 2}`, out);
      if (p) out.products.push(p);
    });
  }
  // Same handle twice: keep the first, so URLs stay unique.
  const seen = new Set<string>();
  out.products = out.products.filter((p) => {
    if (seen.has(p.handle)) {
      out.warnings.push(`“${p.title}”: handle “${p.handle}” used twice — kept the first`);
      return false;
    }
    seen.add(p.handle);
    return true;
  });
  if (!out.products.length && !out.errors.length) out.errors.push("No products found.");
  return out;
}

// ── Stored list ────────────────────────────────────────────────

export async function getManualCatalog(businessId: string): Promise<ManualProduct[] | null> {
  const b = await prisma.business.findUnique({ where: { id: businessId }, select: { manualCatalog: true } }).catch(() => null);
  const list = b?.manualCatalog as unknown;
  return Array.isArray(list) && list.length ? (list as ManualProduct[]) : null;
}

/** Pasted post titles; [] = "no posts yet"; null = not in manual mode. */
export async function getManualPosts(businessId: string): Promise<string[] | null> {
  const b = await prisma.business.findUnique({ where: { id: businessId }, select: { manualPosts: true } }).catch(() => null);
  const list = b?.manualPosts as unknown;
  return Array.isArray(list) ? (list as unknown[]).map(String).filter(Boolean) : null;
}

/** Save a parsed list. Saving a list also turns on "no posts yet" if no titles were pasted. */
export async function saveManualCatalog(businessId: string, products: ManualProduct[]): Promise<void> {
  const b = await prisma.business.findUnique({ where: { id: businessId }, select: { manualPosts: true } });
  await prisma.business.update({
    where: { id: businessId },
    data: {
      manualCatalog: products as unknown as object,
      manualCatalogAt: new Date(),
      ...(b?.manualPosts == null ? { manualPosts: [] } : {}),
    },
  });
}

export async function clearManualCatalog(businessId: string): Promise<void> {
  await prisma.business.update({
    where: { id: businessId },
    data: { manualCatalog: Prisma.DbNull, manualCatalogAt: null, manualPosts: Prisma.DbNull },
  });
}

export async function saveManualPosts(businessId: string, titles: string[]): Promise<void> {
  const clean = [...new Set(titles.map((t) => t.trim()).filter(Boolean))].slice(0, 5000);
  await prisma.business.update({ where: { id: businessId }, data: { manualPosts: clean } });
}

// ── The list in the shapes the engine's readers use ────────────

/** Collections (one per collection name), like the Admin API's list. */
export function manualCollections(products: ManualProduct[]): AdminCollection[] {
  const by = new Map<string, { title: string; count: number }>();
  for (const p of products) {
    for (const c of p.collections) {
      const h = slugify(c);
      const cur = by.get(h) ?? { title: c, count: 0 };
      cur.count++;
      by.set(h, cur);
    }
  }
  return [...by.entries()].map(([handle, v], i) => ({
    id: i + 1,
    handle,
    title: v.title,
    body_html: null,
    published_at: new Date(0).toISOString(),
    products_count: v.count,
  }));
}

/** The products of one collection, like the storefront's products.json. */
export function manualCollectionProducts(products: ManualProduct[], handle: string): AdminProduct[] {
  return products
    .filter((p) => p.collections.some((c) => slugify(c) === handle))
    .map((p) => ({
      title: p.title,
      handle: p.handle,
      product_type: p.type,
      tags: "",
      body_html: p.description,
      variants: (p.prices.length ? p.prices : [0]).map((n) => ({ price: n ? String(n) : "", compare_at_price: null })),
      options: p.options,
    }));
}

/** Product facts for blog enrichment: the best matches for a keyword. */
export function manualProductFacts(products: ManualProduct[], query: string, limit = 8): { title: string; price?: string; specs?: string }[] {
  const words = query.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  const scored = products
    .map((p) => {
      const hay = `${p.title} ${p.type} ${p.collections.join(" ")} ${p.description}`.toLowerCase();
      return { p, score: words.reduce((n, w) => n + (hay.includes(w) ? 1 : 0), 0) };
    })
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(({ p }) => ({
    title: p.title,
    price: p.prices.length ? (p.prices.length > 1 ? `$${Math.min(...p.prices)}–$${Math.max(...p.prices)}` : `$${p.prices[0]}`) : undefined,
    specs: [p.type, ...p.options.map((o) => `${o.name}: ${o.values.join(", ")}`), p.description.slice(0, 160)].filter(Boolean).join(" · "),
  }));
}

/** A plain-text picture of the store for brand intake. */
export function manualIntakeCorpus(products: ManualProduct[]): string {
  const cols = manualCollections(products);
  return [
    `COLLECTIONS:\n${cols.map((c) => `- ${c.title} (${c.products_count} products)`).join("\n")}`,
    `PRODUCTS:\n${products
      .slice(0, 60)
      .map((p) => {
        const price = p.prices.length ? ` $${Math.min(...p.prices)}${p.prices.length > 1 ? `–$${Math.max(...p.prices)}` : ""}` : "";
        const opts = p.options.map((o) => `${o.name}: ${o.values.join("/")}`).join("; ");
        return `- ${p.title}${p.type ? ` [${p.type}]` : ""}${price}${opts ? ` (${opts})` : ""}${p.description ? `: ${p.description.slice(0, 200)}` : ""}`;
      })
      .join("\n")}`,
  ].join("\n\n");
}

// Collection-page discovery — crawls the store's PUBLIC site so every category
// page is known to the dashboard before anyone types a URL. Reads only public
// endpoints (Shopify's storefront /collections.json and the sitemap); needs no
// Shopify permission and never writes anything.

import { INDUSTRIES, type IndustryPack } from "@/lib/categories/industry";

const UA = "Mozilla/5.0 (compatible; ContentEngineBot/1.0)";

/** Shopify's default/system collections that aren't real category pages. */
const SYSTEM_HANDLES = new Set(["all", "frontpage"]);

/** State / regional collections ("alabama-caskets", "east-coast-caskets"): the
 *  same catalog filtered by place. These get SHORT, localized copy so fifty of
 *  them don't become thin duplicates of the hub. */
const STATES: Record<string, string> = {
  alabama: "Alabama", alaska: "Alaska", arizona: "Arizona", arkansas: "Arkansas", california: "California",
  colorado: "Colorado", connecticut: "Connecticut", delaware: "Delaware", florida: "Florida", georgia: "Georgia",
  hawaii: "Hawaii", idaho: "Idaho", illinois: "Illinois", indiana: "Indiana", iowa: "Iowa", kansas: "Kansas",
  kentucky: "Kentucky", louisiana: "Louisiana", maine: "Maine", maryland: "Maryland", massachusetts: "Massachusetts",
  michigan: "Michigan", minnesota: "Minnesota", mississippi: "Mississippi", missouri: "Missouri", montana: "Montana",
  nebraska: "Nebraska", nevada: "Nevada", "new-hampshire": "New Hampshire", "new-jersey": "New Jersey",
  "new-mexico": "New Mexico", "new-york": "New York", "north-carolina": "North Carolina", "north-dakota": "North Dakota",
  ohio: "Ohio", oklahoma: "Oklahoma", oregon: "Oregon", pennsylvania: "Pennsylvania", "rhode-island": "Rhode Island",
  "south-carolina": "South Carolina", "south-dakota": "South Dakota", tennessee: "Tennessee", texas: "Texas", utah: "Utah",
  vermont: "Vermont", virginia: "Virginia", washington: "Washington", "west-virginia": "West Virginia",
  wisconsin: "Wisconsin", wyoming: "Wyoming", "washington-dc": "Washington, D.C.",
};
const REGIONS: Record<string, string> = {
  "east-coast": "the East Coast", "west-coast": "the West Coast", "mid-west": "the Midwest", midwest: "the Midwest",
  northeast: "the Northeast", southeast: "the Southeast", southwest: "the Southwest", northwest: "the Northwest",
  "pacific-northwest": "the Pacific Northwest", "new-england": "New England",
};

/** The place a state/regional collection is about, or null. */
export function localityFor(handle: string): string | null {
  const h = handle.toLowerCase();
  for (const [slug, name] of Object.entries(STATES)) {
    if (h === slug || h.startsWith(`${slug}-`) || h.endsWith(`-${slug}`)) return name;
  }
  for (const [slug, name] of Object.entries(REGIONS)) {
    if (h === slug || h.startsWith(`${slug}-`) || h.endsWith(`-${slug}`)) return name;
  }
  return null;
}

export interface DiscoveredCollection {
  handle: string;
  url: string;
  title: string;
  productCount: number | null;
  /** The live page already carries editorial copy (a real description). */
  hasContent: boolean;
  tier: 1 | 2 | 3;
  /** A sensible starting keyword, refined later by the brief. */
  keyword: string;
}

export function siteBase(domain: string): string {
  return `https://${domain.replace(/^https?:\/\//i, "").replace(/\/+$/, "")}`;
}

async function getText(url: string, timeoutMs = 15000): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json,text/xml,text/html;q=0.9,*/*;q=0.8" },
      signal: ctrl.signal,
      redirect: "follow",
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** A single-size variant collection ("20-x-10-x-16-slant-headstones", "28-inch-caskets"). */
const SIZE_VARIANT_RE = /^\d{2}-x-\d{1,2}(-x-\d{1,2})?-|^\d{2}-inch-/;

/**
 * Depth for a collection. Hubs are the industry's named head terms, plus the
 * store's three biggest general collections (≥ 15 products) — so a store whose
 * money pages have unusual handles still gets its hubs. State/regional and
 * single-size variant pages are always tier 3. A colour/finish filter is tier 3
 * only when it's small; a 50-product "black headstone" page is a real category
 * and gets full sub-collection depth.
 */
export function tierFor(handle: string, productCount: number | null, pack: IndustryPack, bigHandles: Set<string>): 1 | 2 | 3 {
  const n = productCount ?? 0;
  if (localityFor(handle) || SIZE_VARIANT_RE.test(handle)) return 3;
  if (pack.hubHandles.has(handle) || pack.hubPattern.test(handle)) return 1;
  if (bigHandles.has(handle)) return 1;
  if (pack.colourPattern.test(handle) && n < 12) return 3;
  return 2;
}

/** The three biggest general (non-colour, non-local, non-variant) collections with ≥ 15 products. */
export function biggestHandles(cols: { handle: string; productCount: number | null }[], pack: IndustryPack): Set<string> {
  return new Set(
    cols
      .filter((c) => (c.productCount ?? 0) >= 15)
      .filter((c) => !localityFor(c.handle) && !SIZE_VARIANT_RE.test(c.handle) && !pack.colourPattern.test(c.handle))
      .sort((a, b) => (b.productCount ?? 0) - (a.productCount ?? 0) || a.handle.localeCompare(b.handle))
      .slice(0, 3)
      .map((c) => c.handle),
  );
}

/** "metal-caskets" → "metal caskets"; keeps a short, human title when it reads
 *  like a keyword already (≤ 4 words), else derives from the handle. */
export function keywordFor(handle: string, title: string): string {
  const t = title.trim().toLowerCase().replace(/\s+/g, " ");
  const words = t.split(" ").filter(Boolean);
  const looksLikeKeyword =
    words.length > 0 && words.length <= 4 && !/[|:–—]/.test(t) && !/^(shop|buy|all)\b/.test(t);
  if (looksLikeKeyword) return t;
  return handle.replace(/-/g, " ").replace(/\b(\d+)\b/g, "$1").trim();
}

type ShopifyCollection = {
  handle?: string;
  title?: string;
  body_html?: string | null;
  products_count?: number;
  published_at?: string | null;
};

type Found = Omit<DiscoveredCollection, "tier">;

/** Shopify storefront: /collections.json (public, paginated). */
async function fromCollectionsJson(base: string): Promise<Found[]> {
  const out: Found[] = [];
  for (let page = 1; page <= 8; page++) {
    const raw = await getText(`${base}/collections.json?limit=250&page=${page}`);
    if (!raw) break;
    let data: { collections?: ShopifyCollection[] };
    try {
      data = JSON.parse(raw) as { collections?: ShopifyCollection[] };
    } catch {
      break;
    }
    const cols = data.collections ?? [];
    if (cols.length === 0) break;
    for (const c of cols) {
      const handle = String(c.handle ?? "").trim();
      if (!handle || SYSTEM_HANDLES.has(handle)) continue;
      if (c.published_at === null) continue; // unpublished
      // An empty collection isn't a shoppable category page — nothing to rank,
      // nothing to sell. (Placeholder/system collections show up this way.)
      if (typeof c.products_count === "number" && c.products_count === 0) continue;
      const title = String(c.title ?? handle).trim();
      const desc = stripHtml(String(c.body_html ?? ""));
      out.push({
        handle,
        url: `${base}/collections/${handle}`,
        title,
        productCount: typeof c.products_count === "number" ? c.products_count : null,
        hasContent: desc.length >= 200,
        keyword: keywordFor(handle, title),
      });
    }
  }
  return out;
}

/** Sitemap fallback/supplement: sitemap.xml → sitemap_collections_*.xml → <loc>s. */
async function fromSitemap(base: string): Promise<Found[]> {
  const index = await getText(`${base}/sitemap.xml`);
  if (!index) return [];
  const subs = [...index.matchAll(/<loc>\s*([^<\s]+sitemap_collections[^<\s]*)\s*<\/loc>/gi)].map((m) =>
    m[1].replace(/&amp;/g, "&"),
  );
  const locs: string[] = [];
  for (const sub of subs.slice(0, 5)) {
    const xml = await getText(sub);
    if (!xml) continue;
    for (const m of xml.matchAll(/<loc>\s*([^<\s]+\/collections\/([a-z0-9-]+))\s*<\/loc>/gi)) {
      locs.push(m[1]);
    }
  }
  const seen = new Set<string>();
  const out: Found[] = [];
  for (const loc of locs) {
    const handle = loc.split("/collections/")[1]?.split(/[/?#]/)[0] ?? "";
    if (!handle || SYSTEM_HANDLES.has(handle) || seen.has(handle)) continue;
    seen.add(handle);
    const title = handle.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    out.push({
      handle,
      url: `${base}/collections/${handle}`,
      title,
      productCount: null,
      hasContent: false,
      keyword: keywordFor(handle, title),
    });
  }
  return out;
}

/**
 * Every published collection on the store. Primary source is /collections.json
 * (gives title, description, product count); the sitemap fills in anything it
 * misses. Tiers are assigned against the whole roster (so "biggest collections"
 * means biggest on THIS store). Returns [] if the site can't be read.
 */
export async function discoverCollections(domain: string, pack: IndustryPack = INDUSTRIES.general): Promise<DiscoveredCollection[]> {
  const base = siteBase(domain);
  const [primary, extra] = await Promise.all([fromCollectionsJson(base), fromSitemap(base)]);
  const byHandle = new Map<string, Found>();
  for (const c of primary) byHandle.set(c.handle, c);
  for (const c of extra) if (!byHandle.has(c.handle)) byHandle.set(c.handle, c);
  const all = [...byHandle.values()];
  const big = biggestHandles(all, pack);
  return all
    .map((c) => ({ ...c, tier: tierFor(c.handle, c.productCount, pack, big) }))
    .sort((a, b) => a.tier - b.tier || a.handle.localeCompare(b.handle));
}

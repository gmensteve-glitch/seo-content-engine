// Fallback list of the blog posts live on a store, read from its public sitemap,
// for when the Shopify Admin API can't be read (see getLivePosts in the
// pipeline service, which tries the Admin API first). Shopify lists articles in
// sitemap_articles_*.xml; older stores used sitemap_blogs_*.xml, so both are
// read. A sitemap only has PUBLISHED articles: hidden and scheduled ones are
// invisible here, which is why the Admin API is the primary source.
// Titles are rebuilt from the article handle ("how-to-clean-a-granite-headstone"
// → "how to clean a granite headstone"), which is what duplicate checks need.
// Cached per domain for six hours; every fetch is bounded by a timeout.

const UA = "Mozilla/5.0 (compatible; SEOContentEngine/1.0)";
const TTL_MS = 6 * 60 * 60 * 1000;

export interface SitePost {
  url: string;
  title: string;
}

const cache = new Map<string, { at: number; posts: SitePost[] }>();

async function getText(url: string, timeoutMs = 15000): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: ctrl.signal });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function locs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1].replace(/&amp;/g, "&"));
}

/** "/blogs/news/how-to-clean-a-headstone" → "how to clean a headstone". */
function titleFromUrl(url: string): string | null {
  const m = url.match(/\/blogs\/[^/]+\/([^/?#]+)/);
  if (!m) return null;
  return decodeURIComponent(m[1]).replace(/-+/g, " ").trim() || null;
}

/** Every blog article URL on the store's public sitemap (empty if unreachable). */
export async function fetchSitePosts(domain: string): Promise<SitePost[]> {
  const host = domain.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  if (!host) return [];
  const hit = cache.get(host);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.posts;

  const base = `https://${host}`;
  const index = await getText(`${base}/sitemap.xml`);
  if (!index) return hit?.posts ?? [];
  // Article sitemaps, following one level of nested indexes (some stores split
  // the index per market/language).
  const isArticleMap = (u: string) => /sitemap_(articles|blogs)/i.test(u);
  let subs = locs(index).filter(isArticleMap);
  if (!subs.length) {
    for (const nested of locs(index).filter((u) => /sitemap.*\.xml/i.test(u)).slice(0, 5)) {
      const xml = await getText(nested);
      if (xml) subs.push(...locs(xml).filter(isArticleMap));
    }
  }
  subs = [...new Set(subs)];
  const urls = new Set<string>();
  for (const sub of subs.slice(0, 40)) {
    const xml = await getText(sub);
    if (!xml) continue;
    for (const u of locs(xml)) if (/\/blogs\/[^/]+\/[^/]+/.test(u)) urls.add(u);
  }
  const posts: SitePost[] = [];
  for (const url of urls) {
    const title = titleFromUrl(url);
    if (title) posts.push({ url, title });
  }
  // Never cache an empty result: an empty list must be re-checked, not trusted.
  if (posts.length) cache.set(host, { at: Date.now(), posts });
  return posts;
}

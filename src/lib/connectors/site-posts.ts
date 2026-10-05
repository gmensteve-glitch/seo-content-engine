// The blog posts already live on a store, read from its public sitemap
// (sitemap.xml → sitemap_blogs_*.xml), so it works with or without a Shopify
// connection and covers every blog on the store, not just the one we publish to.
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
  const subs = locs(index).filter((u) => /sitemap_blogs/i.test(u));
  const urls = new Set<string>();
  for (const sub of subs.slice(0, 10)) {
    const xml = await getText(sub);
    if (!xml) continue;
    for (const u of locs(xml)) if (/\/blogs\/[^/]+\/[^/]+/.test(u)) urls.add(u);
  }
  const posts: SitePost[] = [];
  for (const url of urls) {
    const title = titleFromUrl(url);
    if (title) posts.push({ url, title });
  }
  cache.set(host, { at: Date.now(), posts });
  return posts;
}

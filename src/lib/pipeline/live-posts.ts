// Every blog post a store already has, for duplicate checks, pillar coverage and
// the ideator. READ-ONLY: it never writes to the store.
//
// 1. Shopify Admin API (primary): every article in every blog, any status
//    (published, hidden, scheduled), paginated to the end, with real titles,
//    handles and authors. Needs the store's Shopify connector.
// 2. Public sitemap (fallback): sitemap_articles*.xml (and the older
//    sitemap_blogs*.xml). Published articles only; titles rebuilt from handles.
//
// An empty result is NEVER "this store has no posts": it means the list could
// not be read. `ok` is false then, and callers must stop (idea generation pauses
// and shows the warning) instead of carrying on as if nothing exists.

import { prisma } from "@/lib/db";
import { encryptionEnabled } from "@/lib/env";
import { getCmsAdapter, type CmsPlatform } from "@/lib/cms";
import { freshCmsConfig } from "@/lib/cms/connector-config";
import { fetchSitePosts } from "@/lib/connectors/site-posts";
import type { ConnectorType } from "@prisma/client";

export interface LivePost {
  title: string;
  handle: string;
  url: string;
  status: "published" | "hidden" | "scheduled";
  author: string | null;
  tags: string[];
}

export interface LivePostList {
  /** False when no posts could be read from either source. Callers must stop. */
  ok: boolean;
  source: "shopify-admin" | "sitemap" | "none";
  posts: LivePost[];
  /** Real author names on the store's articles (for bylines). Admin source only. */
  authors: string[];
  /** Why the list is empty or only partial (shown to the operator). */
  warning?: string;
  readAt: string;
}

const TTL_MS = 30 * 60 * 1000;
const cache = new Map<string, { at: number; list: LivePostList }>();

function connectorType(platform: CmsPlatform): ConnectorType {
  return platform === "wordpress" ? "WORDPRESS" : platform === "webflow" ? "WEBFLOW" : "SHOPIFY";
}

/** Show the store's public domain, not its internal myshopify.com address. */
function publicUrl(url: string, domain: string): string {
  const host = domain.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  return host ? url.replace(/^https?:\/\/[^/]+/, `https://${host}`) : url;
}

function handleFromUrl(url: string): string {
  return decodeURIComponent(url.match(/\/blogs\/[^/]+\/([^/?#]+)/)?.[1] ?? "");
}

/** The store's live-post list (cached 30 min; a failed read is never cached). */
export async function getLivePosts(businessId: string, opts: { fresh?: boolean } = {}): Promise<LivePostList> {
  const hit = cache.get(businessId);
  if (!opts.fresh && hit && Date.now() - hit.at < TTL_MS) return hit.list;

  const business = await prisma.business.findUnique({ where: { id: businessId } });
  const readAt = new Date().toISOString();
  if (!business) return { ok: false, source: "none", posts: [], authors: [], warning: "Store not found.", readAt };

  let adminProblem = "";
  const platform = business.cmsPlatform.toLowerCase() as CmsPlatform;
  const connector = await prisma.connector.findUnique({
    where: { businessId_type: { businessId, type: connectorType(platform) } },
  });
  if (!connector || connector.status !== "CONNECTED") {
    adminProblem = "the store's Shopify connection isn't set up (Connectors)";
  } else if (!encryptionEnabled()) {
    adminProblem = "stored Shopify credentials can't be decrypted (CONNECTOR_ENCRYPTION_KEY is not set)";
  } else {
    try {
      const adapter = getCmsAdapter(platform, await freshCmsConfig(connector));
      if (!adapter.listAllArticles) throw new Error("this platform can't list articles");
      const articles = await adapter.listAllArticles();
      if (articles.length) {
        const list: LivePostList = {
          ok: true,
          source: "shopify-admin",
          posts: articles.map((a) => ({
            title: a.title,
            handle: a.handle,
            url: publicUrl(a.url, business.domain),
            status: a.status,
            author: a.author,
            tags: a.tags,
          })),
          authors: [...new Set(articles.map((a) => a.author).filter((x): x is string => Boolean(x)))].sort(),
          readAt,
        };
        cache.set(businessId, { at: Date.now(), list });
        return list;
      }
      adminProblem = "Shopify returned 0 articles";
    } catch (e) {
      adminProblem = `Shopify Admin API failed: ${e instanceof Error ? e.message : String(e)}`;
      console.error(`[live-posts] ${business.name}: ${adminProblem}`);
    }
  }

  const fromSitemap = await fetchSitePosts(business.domain).catch(() => []);
  if (fromSitemap.length) {
    const list: LivePostList = {
      ok: true,
      source: "sitemap",
      posts: fromSitemap.map((p) => ({
        title: p.title,
        handle: handleFromUrl(p.url),
        url: p.url,
        status: "published" as const,
        author: null,
        tags: [],
      })),
      authors: [],
      warning: `Read from the public sitemap because ${adminProblem}. Hidden and scheduled posts are not included, and titles are rebuilt from the URL.`,
      readAt,
    };
    cache.set(businessId, { at: Date.now(), list });
    return list;
  }

  const list: LivePostList = {
    ok: false,
    source: "none",
    posts: [],
    authors: [],
    warning:
      `Couldn't read the blog posts already on ${business.domain}: ${adminProblem}, and its sitemap ` +
      `(sitemap_articles) listed none. New ideas are paused until the list can be read, so the engine can't ` +
      `suggest a post you already have.`,
    readAt,
  };
  console.warn(`[live-posts] ${business.name}: ${list.warning}`);
  return list;
}

/** Drop the cached list (e.g. after reconnecting Shopify). */
export function forgetLivePosts(businessId: string): void {
  cache.delete(businessId);
}

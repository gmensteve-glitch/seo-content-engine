// Shopify adapter — first implementation (covers trustedcaskets + overnightcaskets).
// Publishes into Shopify's NATIVE blog via the Admin API (the clean path — no theme hacking).
// STUB: method bodies are outlined with the exact Admin API calls to wire once deps are installed.

import type {
  CmsAdapter,
  CmsPage,
  PublishInput,
  PublishResult,
  ShopifyConfig,
} from "./types";

const API_VERSION = "2025-01";

export class ShopifyAdapter implements CmsAdapter {
  readonly platform = "shopify" as const;

  constructor(private cfg: ShopifyConfig) {}

  private base() {
    return `https://${this.cfg.storeDomain}/admin/api/${API_VERSION}`;
  }

  private headers() {
    return {
      "X-Shopify-Access-Token": this.cfg.adminAccessToken,
      "Content-Type": "application/json",
    };
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    // 1. Resolve the target blog id (from blogHandle or the first blog).
    //    GET {base}/blogs.json
    // 2. Create the article:
    //    POST {base}/blogs/{blog_id}/articles.json
    //    body: { article: { title, body_html: input.html, handle: input.slug,
    //            published: input.publishState === "published",
    //            summary_html: input.metaDescription, image: {src: heroImageUrl},
    //            tags: (input.tags ?? []).join(", ") } }
    // 3. Return { cmsId: article.id, url: `https://${domain}/blogs/{blog_handle}/{handle}` }
    throw new Error("ShopifyAdapter.publish not yet wired — pending npm install + connector.");
  }

  async update(cmsId: string, input: Partial<PublishInput>): Promise<PublishResult> {
    // PUT {base}/blogs/{blog_id}/articles/{cmsId}.json  with changed fields.
    throw new Error("ShopifyAdapter.update not yet wired.");
  }

  async list(opts?: { limit?: number; cursor?: string }): Promise<CmsPage[]> {
    // GET {base}/blogs/{blog_id}/articles.json?limit=... (cursor paginated via Link header)
    throw new Error("ShopifyAdapter.list not yet wired.");
  }

  async healthCheck(): Promise<{ ok: boolean; message?: string }> {
    // GET {base}/shop.json — 200 means token + domain are valid.
    throw new Error("ShopifyAdapter.healthCheck not yet wired.");
  }
}

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

  private async req<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.base()}${path}`, { ...init, headers: this.headers() });
    if (!res.ok) throw new Error(`Shopify ${init?.method ?? "GET"} ${path} → HTTP ${res.status}`);
    return (await res.json()) as T;
  }

  private async resolveBlog(): Promise<{ id: number; handle: string }> {
    const data = await this.req<{ blogs?: Array<{ id: number; handle: string }> }>("/blogs.json");
    const blogs = data.blogs ?? [];
    const chosen = this.cfg.blogHandle
      ? blogs.find((b) => b.handle === this.cfg.blogHandle)
      : blogs[0];
    if (!chosen) throw new Error("No Shopify blog found to publish into");
    return chosen;
  }

  private articleUrl(blogHandle: string, slug: string): string {
    return `https://${this.cfg.storeDomain.replace(/\.myshopify\.com$/, "")}.myshopify.com/blogs/${blogHandle}/${slug}`;
  }

  // Shopify's SEO "Page title" and "Meta description" fields are metafields in
  // the `global` namespace — NOT the article's title/summary. Set them so the
  // search-engine listing is populated on publish.
  private seoMetafields(input: Partial<PublishInput>): Array<Record<string, unknown>> {
    const fields: Array<Record<string, unknown>> = [];
    const titleTag = input.seoTitle ?? input.title;
    if (titleTag) {
      fields.push({ namespace: "global", key: "title_tag", type: "single_line_text_field", value: titleTag });
    }
    if (input.metaDescription) {
      fields.push({ namespace: "global", key: "description_tag", type: "single_line_text_field", value: input.metaDescription });
    }
    return fields;
  }

  // Shopify renders <script> tags in a blog article body as VISIBLE TEXT (it
  // doesn't allow inline scripts), so a JSON-LD block placed in body_html shows
  // up as a wall of raw text on the page. Strip it before publishing; the theme
  // emits its own Article/BlogPosting schema, and SEO title/description are set
  // via the global.* metafields instead.
  private stripInlineScripts(html: string): string {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/(\s*\n){3,}/g, "\n\n")
      .trim();
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    const blog = await this.resolveBlog();
    const data = await this.req<{ article: { id: number; handle: string } }>(
      `/blogs/${blog.id}/articles.json`,
      {
        method: "POST",
        body: JSON.stringify({
          article: {
            title: input.title,
            body_html: this.stripInlineScripts(input.html),
            handle: input.slug,
            published: input.publishState === "published",
            summary_html: input.metaDescription,
            tags: (input.tags ?? []).join(", "),
            metafields: this.seoMetafields(input),
            ...(input.heroImageUrl
              ? { image: { src: input.heroImageUrl, alt: input.heroImageAlt } }
              : {}),
          },
        }),
      }
    );
    return { cmsId: String(data.article.id), url: this.articleUrl(blog.handle, data.article.handle) };
  }

  async update(cmsId: string, input: Partial<PublishInput>): Promise<PublishResult> {
    const blog = await this.resolveBlog();
    const article: Record<string, unknown> = { id: Number(cmsId) };
    if (input.title !== undefined) article.title = input.title;
    if (input.html !== undefined) article.body_html = this.stripInlineScripts(input.html);
    if (input.slug !== undefined) article.handle = input.slug;
    if (input.metaDescription !== undefined) article.summary_html = input.metaDescription;
    if (input.tags !== undefined) article.tags = input.tags.join(", ");
    if (input.publishState !== undefined) article.published = input.publishState === "published";
    if (input.title !== undefined || input.seoTitle !== undefined || input.metaDescription !== undefined) {
      const seo = this.seoMetafields(input);
      if (seo.length) article.metafields = seo;
    }

    const data = await this.req<{ article: { id: number; handle: string } }>(
      `/blogs/${blog.id}/articles/${cmsId}.json`,
      { method: "PUT", body: JSON.stringify({ article }) }
    );
    return { cmsId: String(data.article.id), url: this.articleUrl(blog.handle, data.article.handle) };
  }

  async list(opts?: { limit?: number }): Promise<CmsPage[]> {
    const blog = await this.resolveBlog();
    const data = await this.req<{
      articles?: Array<{ id: number; title: string; handle: string; updated_at: string }>;
    }>(`/blogs/${blog.id}/articles.json?limit=${opts?.limit ?? 50}`);
    return (data.articles ?? []).map((a) => ({
      cmsId: String(a.id),
      url: this.articleUrl(blog.handle, a.handle),
      title: a.title,
      updatedAt: a.updated_at,
    }));
  }

  async healthCheck(): Promise<{ ok: boolean; message?: string }> {
    try {
      await this.req("/shop.json");
      return { ok: true };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  }

  /** Pick the store product whose title/tags best match the query and return
   *  its first image — a real casket photo for buying-guide articles. */
  async sourceProductImage(query: string): Promise<{ url: string; alt: string } | null> {
    try {
      const data = await this.req<{
        products?: Array<{
          title: string;
          tags?: string;
          image?: { src: string } | null;
          images?: Array<{ src: string }>;
        }>;
      }>("/products.json?limit=25&fields=id,title,tags,image,images");

      const products = (data.products ?? []).filter((p) => p.image?.src || p.images?.[0]?.src);
      if (products.length === 0) return null;

      const terms = query.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
      let best = products[0];
      let bestScore = -1;
      for (const p of products) {
        const hay = `${p.title} ${p.tags ?? ""}`.toLowerCase();
        const score = terms.reduce((s, t) => s + (hay.includes(t) ? 1 : 0), 0);
        if (score > bestScore) {
          bestScore = score;
          best = p;
        }
      }
      const src = best.image?.src ?? best.images?.[0]?.src;
      return src ? { url: src, alt: best.title } : null;
    } catch {
      return null;
    }
  }

  /** Real product facts (title + price + specs) from the store, most relevant
   *  first — the concrete, verifiable substance the enricher weaves into a
   *  near-miss draft (real casket prices/materials). */
  async listProductFacts(query: string, limit = 8): Promise<{ title: string; price?: string; specs?: string }[]> {
    try {
      const data = await this.req<{
        products?: Array<{
          title: string;
          tags?: string;
          product_type?: string;
          variants?: Array<{ price?: string; weight?: number; weight_unit?: string }>;
        }>;
      }>("/products.json?limit=50&fields=id,title,tags,product_type,variants");

      const products = data.products ?? [];
      if (products.length === 0) return [];

      const terms = query.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
      const scored = products
        .map((p) => {
          const hay = `${p.title} ${p.tags ?? ""} ${p.product_type ?? ""}`.toLowerCase();
          const score = terms.reduce((s, t) => s + (hay.includes(t) ? 1 : 0), 0);
          const v = p.variants?.[0];
          const price = v?.price ? `$${Number(v.price).toLocaleString()}` : undefined;
          const specParts: string[] = [];
          if (p.product_type) specParts.push(p.product_type);
          if (v?.weight) specParts.push(`${v.weight}${v.weight_unit ?? ""}`);
          if (p.tags) specParts.push(p.tags.split(",").slice(0, 3).map((t) => t.trim()).join(", "));
          return {
            score,
            fact: { title: p.title, price, specs: specParts.filter(Boolean).join(" · ") || undefined },
          };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((x) => x.fact);

      return scored;
    } catch {
      return [];
    }
  }
}

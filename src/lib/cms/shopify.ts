// Shopify adapter — first implementation (covers trustedcaskets + overnightcaskets).
// Publishes into Shopify's NATIVE blog via the Admin API (the clean path — no theme hacking).
// STUB: method bodies are outlined with the exact Admin API calls to wire once deps are installed.

import type {
  AdminCollection,
  AdminProduct,
  CmsAdapter,
  CmsArticle,
  CmsPage,
  PublishInput,
  PublishResult,
  ShopifyConfig,
} from "./types";

const API_VERSION = "2025-01";

export class ShopifyAdapter implements CmsAdapter {
  readonly platform = "shopify" as const;

  constructor(private cfg: ShopifyConfig) {}

  /** The bare admin host — tolerant of a storeDomain saved with a scheme and/or
   *  trailing slash (e.g. "https://store.myshopify.com/"), which would otherwise
   *  produce "https://https://store.myshopify.com//admin/..." → ENOTFOUND. */
  private host(): string {
    return this.cfg.storeDomain.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  }

  private base() {
    return `https://${this.host()}/admin/api/${API_VERSION}`;
  }

  private headers() {
    return {
      "X-Shopify-Access-Token": this.cfg.adminAccessToken,
      "Content-Type": "application/json",
    };
  }

  private async req<T>(path: string, init?: RequestInit): Promise<T> {
    const url = `${this.base()}${path}`;
    // Shopify calls occasionally fail at the network layer ("fetch failed" —
    // a transient DNS/connect/TLS hiccup, common on serverless egress). Retry a
    // few times with backoff before giving up, and surface the real underlying
    // cause code (ENOTFOUND, ECONNREFUSED, cert error, timeout) so a genuine
    // failure is diagnosable instead of an opaque "fetch failed".
    let res: Response | null = null;
    let netErr: unknown;
    for (let attempt = 0; attempt < 3 && !res; attempt++) {
      try {
        res = await fetch(url, { ...init, headers: this.headers(), signal: AbortSignal.timeout(30000) });
      } catch (e) {
        netErr = e;
        if (attempt < 2) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    }
    if (!res) {
      const cause = (netErr as { cause?: { code?: string; message?: string } } | undefined)?.cause;
      const detail =
        cause?.code || cause?.message || (netErr instanceof Error ? netErr.message : "network error");
      throw new Error(`couldn't reach ${this.cfg.storeDomain} (${detail})`);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Shopify ${init?.method ?? "GET"} ${path} → HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`,
      );
    }
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
    return `https://${this.host()}/blogs/${blogHandle}/${slug}`;
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
            // AI images arrive as base64 → Shopify hosts them via `attachment`;
            // stock/product photos have a hosted URL → `src`.
            ...(input.heroImageBase64
              ? { image: { attachment: input.heroImageBase64, alt: input.heroImageAlt } }
              : input.heroImageUrl
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

  /** One GET of an absolute Admin URL, returning the JSON and the next page's
   *  URL from Shopify's cursor pagination (Link: <…page_info=…>; rel="next"). */
  private async getPage<T>(url: string): Promise<{ data: T; next: string | null }> {
    let res: Response | null = null;
    let netErr: unknown;
    for (let attempt = 0; attempt < 3 && !res; attempt++) {
      try {
        res = await fetch(url, { headers: this.headers(), signal: AbortSignal.timeout(30000) });
        if (res.status === 429 && attempt < 2) {
          res = null; // rate limited: back off and retry
          await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        }
      } catch (e) {
        netErr = e;
        if (attempt < 2) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    }
    if (!res) throw new Error(`couldn't reach ${this.cfg.storeDomain} (${netErr instanceof Error ? netErr.message : "network error"})`);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Shopify GET ${url.replace(this.base(), "")} → HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
    }
    const link = res.headers.get("link") ?? "";
    const next = link.split(",").find((part) => /rel="?next"?/.test(part))?.match(/<([^>]+)>/)?.[1] ?? null;
    return { data: (await res.json()) as T, next };
  }

  /** Every article in every blog on the store, any status, to the last page.
   *  Read-only (GET only). Real titles and handles, straight from Shopify. */
  async listAllArticles(): Promise<CmsArticle[]> {
    const blogs: Array<{ id: number; handle: string; title: string }> = [];
    let url: string | null = `${this.base()}/blogs.json?limit=250&fields=id,handle,title`;
    for (let page = 0; url && page < 20; page++) {
      const { data, next }: { data: { blogs?: typeof blogs }; next: string | null } = await this.getPage(url);
      blogs.push(...(data.blogs ?? []));
      url = next;
    }
    const now = Date.now();
    const out: CmsArticle[] = [];
    for (const blog of blogs) {
      type Row = {
        id: number;
        title: string;
        handle: string;
        published_at: string | null;
        updated_at: string;
        author: string | null;
        tags: string | null;
      };
      let next: string | null =
        `${this.base()}/blogs/${blog.id}/articles.json?limit=250&published_status=any` +
        `&fields=id,title,handle,published_at,updated_at,author,tags`;
      for (let page = 0; next && page < 200; page++) {
        const res: { data: { articles?: Row[] }; next: string | null } = await this.getPage(next);
        for (const a of res.data.articles ?? []) {
          const at = a.published_at ? Date.parse(a.published_at) : NaN;
          out.push({
            cmsId: String(a.id),
            title: a.title,
            handle: a.handle,
            url: this.articleUrl(blog.handle, a.handle),
            blogHandle: blog.handle,
            blogTitle: blog.title,
            status: !a.published_at ? "hidden" : at > now ? "scheduled" : "published",
            author: a.author?.trim() || null,
            tags: (a.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean),
            publishedAt: a.published_at,
            updatedAt: a.updated_at,
          });
        }
        next = res.next;
      }
    }
    return out;
  }

  /** Every page of a GET listing, following cursor pagination. */
  private async getAll<T>(firstUrl: string, key: string, maxPages = 40): Promise<T[]> {
    const out: T[] = [];
    let url: string | null = firstUrl;
    for (let page = 0; url && page < maxPages; page++) {
      const res: { data: Record<string, T[] | undefined>; next: string | null } = await this.getPage(url);
      out.push(...(res.data[key] ?? []));
      url = res.next;
    }
    return out;
  }

  private collectionsCache: AdminCollection[] | null = null;

  /** Every collection (custom + smart), with live product counts. Read-only. */
  async listCollectionsRead(): Promise<AdminCollection[]> {
    if (this.collectionsCache) return this.collectionsCache;
    type Row = { id: number; handle: string; title: string; body_html: string | null; published_at: string | null };
    const fields = "fields=id,handle,title,body_html,published_at";
    const [custom, smart] = await Promise.all([
      this.getAll<Row>(`${this.base()}/custom_collections.json?limit=250&${fields}`, "custom_collections"),
      this.getAll<Row>(`${this.base()}/smart_collections.json?limit=250&${fields}`, "smart_collections"),
    ]);
    const out: AdminCollection[] = [];
    for (const c of [...custom, ...smart].slice(0, 150)) {
      let count: number | null = null;
      try {
        const r = await this.getPage<{ count?: number }>(`${this.base()}/products/count.json?collection_id=${c.id}&status=active`);
        count = typeof r.data.count === "number" ? r.data.count : null;
      } catch {
        count = null;
      }
      out.push({ ...c, products_count: count });
    }
    this.collectionsCache = out;
    return out;
  }

  /** Active products in one collection, in the storefront products.json shape. Read-only. */
  async listCollectionProductsRead(handle: string): Promise<AdminProduct[] | null> {
    const col = (await this.listCollectionsRead()).find((c) => c.handle === handle);
    if (!col) return null;
    const rows = await this.getAll<AdminProduct & { tags: string | null; product_type: string | null }>(
      `${this.base()}/products.json?collection_id=${col.id}&status=active&limit=250` +
        `&fields=title,handle,product_type,tags,body_html,variants,options`,
      "products",
      4,
    );
    return rows.map((p) => ({
      title: p.title ?? "",
      handle: p.handle ?? "",
      product_type: p.product_type ?? "",
      tags: p.tags ?? "",
      body_html: p.body_html ?? "",
      variants: (p.variants ?? []).map((v) => ({ price: String(v.price ?? ""), compare_at_price: v.compare_at_price ?? null })),
      options: (p.options ?? []).map((o) => ({ name: o.name, values: o.values ?? [] })),
    }));
  }

  /** The shop's legal policies (refund, shipping, privacy, terms). Read-only. */
  async listPoliciesRead(): Promise<{ title: string; body: string; handle: string }[]> {
    const r = await this.getPage<{ policies?: { title?: string; body?: string; handle?: string }[] }>(`${this.base()}/policies.json`);
    return (r.data.policies ?? []).map((p) => ({ title: p.title ?? "", body: p.body ?? "", handle: p.handle ?? "" }));
  }

  /** Published online-store pages (About, FAQ, Shipping…). Read-only. */
  async listPagesRead(): Promise<{ title: string; handle: string; body: string }[]> {
    const rows = await this.getAll<{ title?: string; handle?: string; body_html?: string; published_at?: string | null }>(
      `${this.base()}/pages.json?limit=250&fields=title,handle,body_html,published_at`,
      "pages",
      4,
    );
    return rows
      .filter((p) => p.published_at)
      .map((p) => ({ title: p.title ?? "", handle: p.handle ?? "", body: p.body_html ?? "" }));
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

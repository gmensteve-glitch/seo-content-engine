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

  async publish(input: PublishInput): Promise<PublishResult> {
    const blog = await this.resolveBlog();
    const data = await this.req<{ article: { id: number; handle: string } }>(
      `/blogs/${blog.id}/articles.json`,
      {
        method: "POST",
        body: JSON.stringify({
          article: {
            title: input.title,
            body_html: input.html,
            handle: input.slug,
            published: input.publishState === "published",
            summary_html: input.metaDescription,
            tags: (input.tags ?? []).join(", "),
            ...(input.heroImageUrl ? { image: { src: input.heroImageUrl } } : {}),
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
    if (input.html !== undefined) article.body_html = input.html;
    if (input.slug !== undefined) article.handle = input.slug;
    if (input.metaDescription !== undefined) article.summary_html = input.metaDescription;
    if (input.tags !== undefined) article.tags = input.tags.join(", ");
    if (input.publishState !== undefined) article.published = input.publishState === "published";

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
}

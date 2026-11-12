// CMS Adapter interface — the pluggability core.
// Every publishing target (Shopify, WordPress, Webflow, ...) implements this ONE interface.
// Adding a business on a new platform = write one adapter, nothing else changes.

export type CmsPlatform = "shopify" | "wordpress" | "webflow" | "custom";

export interface PublishInput {
  title: string;
  /** Rendered HTML body (already includes schema JSON-LD blocks). */
  html: string;
  /** URL slug, e.g. "how-much-does-a-casket-cost". */
  slug: string;
  /** Plain-text meta description for the <head> (SEO description_tag). */
  metaDescription: string;
  /** Optional SEO page title (title_tag). Falls back to `title` if unset. */
  seoTitle?: string;
  /** Optional tags/collection hints the platform may use. */
  tags?: string[];
  /** Optional hero image URL (stock/product photo). */
  heroImageUrl?: string;
  /** Optional hero image bytes as base64 (AI-generated) — the CMS hosts it.
   *  Takes precedence over heroImageUrl when both are present. */
  heroImageBase64?: string;
  /** Alt text for the hero image (SEO + accessibility). */
  heroImageAlt?: string;
  /** Publish immediately vs save as draft in the CMS. */
  publishState: "published" | "draft";
}

export interface PublishResult {
  /** The platform's own id for the created/updated entry. */
  cmsId: string;
  /** Canonical live URL. */
  url: string;
}

/** A collection as the Admin API sees it (read-only). */
export interface AdminCollection {
  id: number;
  handle: string;
  title: string;
  body_html: string | null;
  published_at: string | null;
  products_count: number | null;
}

/** A product in the shape the storefront's products.json uses (read-only). */
export interface AdminProduct {
  title: string;
  handle: string;
  product_type: string;
  tags: string;
  body_html: string;
  variants: { price: string; compare_at_price: string | null }[];
  options: { name: string; values: string[] }[];
}

/** One article on the store, any status (read-only listing). */
export interface CmsArticle {
  cmsId: string;
  title: string;
  handle: string;
  url: string;
  blogHandle: string;
  blogTitle: string;
  /** published = live; hidden = no publish date; scheduled = publish date in the future. */
  status: "published" | "hidden" | "scheduled";
  author: string | null;
  tags: string[];
  publishedAt: string | null;
  updatedAt: string;
}

export interface CmsPage {
  cmsId: string;
  url: string;
  title: string;
  updatedAt: string;
}

/**
 * All methods are per-business — the adapter is constructed with that
 * business's decrypted connector config (tokens, store domain, etc.).
 */
export interface CmsAdapter {
  readonly platform: CmsPlatform;

  /** Create a new page/post. */
  publish(input: PublishInput): Promise<PublishResult>;

  /** Update an existing page/post by its cmsId. */
  update(cmsId: string, input: Partial<PublishInput>): Promise<PublishResult>;

  /** List existing pages (for reconciliation + internal-link targets). */
  list(opts?: { limit?: number; cursor?: string }): Promise<CmsPage[]>;

  /** Optional: EVERY article in EVERY blog, any status (published, hidden,
   *  scheduled), paginated to the end. Read-only. */
  listAllArticles?(): Promise<CmsArticle[]>;

  /** Optional read-only catalog/content readers for a store whose public site
   *  can't be read (password page before launch). GET only. */
  listCollectionsRead?(): Promise<AdminCollection[]>;
  listCollectionProductsRead?(handle: string): Promise<AdminProduct[] | null>;
  listPoliciesRead?(): Promise<{ title: string; body: string; handle: string }[]>;
  listPagesRead?(): Promise<{ title: string; handle: string; body: string }[]>;

  /** Verify the connector credentials work. */
  healthCheck(): Promise<{ ok: boolean; message?: string }>;

  /** Optional: find a relevant product image from the store (for buying-guide
   *  content). Only platforms with a product catalog implement this. */
  sourceProductImage?(query: string): Promise<{ url: string; alt: string } | null>;

  /** Optional: real product facts (title/price/specs) for auto-enrichment. */
  listProductFacts?(
    query: string,
    limit?: number,
  ): Promise<{ title: string; price?: string; specs?: string }[]>;
}

/** Config shapes per platform (decrypted from Connector.configEnc). */
export interface ShopifyConfig {
  storeDomain: string; // xxx.myshopify.com
  adminAccessToken: string; // shpat_...
  blogHandle?: string; // which blog to post into
}

export interface WordPressConfig {
  baseUrl: string;
  username: string;
  appPassword: string;
}

export interface WebflowConfig {
  apiToken: string;
  siteId: string;
  collectionId: string;
}

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
  /** Plain-text meta description for the <head>. */
  metaDescription: string;
  /** Optional tags/collection hints the platform may use. */
  tags?: string[];
  /** Optional hero image URL. */
  heroImageUrl?: string;
  /** Publish immediately vs save as draft in the CMS. */
  publishState: "published" | "draft";
}

export interface PublishResult {
  /** The platform's own id for the created/updated entry. */
  cmsId: string;
  /** Canonical live URL. */
  url: string;
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

  /** Verify the connector credentials work. */
  healthCheck(): Promise<{ ok: boolean; message?: string }>;
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

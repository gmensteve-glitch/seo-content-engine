// Kill switch for every write to a store's blog (create or update an article).
// OFF unless the BLOG_PUBLISHING env var is exactly "on" (owner decision,
// 2026-11-04: the engine must not publish blogs to Shopify; the operator
// downloads them and publishes by hand). Enforced in getCmsAdapter, so no code
// path can create or edit an article while it is off; the pipeline also checks
// it up front so nothing spends time or AI money on a publish that would fail.

export function blogPublishingEnabled(): boolean {
  return process.env.BLOG_PUBLISHING === "on";
}

export const BLOG_PUBLISHING_OFF =
  "Publishing to Shopify is turned off for this engine. Download the blog and publish it by hand.";

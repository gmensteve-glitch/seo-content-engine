// Adapter registry — resolve the right CMS adapter for a business.
// This is the single place the rest of the app asks "how do I publish for this business?"

import type { CmsAdapter, CmsPlatform, ShopifyConfig } from "./types";
import { ShopifyAdapter } from "./shopify";
import { BLOG_PUBLISHING_OFF, blogPublishingEnabled } from "./publishing";

/**
 * @param platform  business.cmsPlatform
 * @param config    decrypted Connector.configEnc for the publishing connector
 */
export function getCmsAdapter(platform: CmsPlatform, config: unknown): CmsAdapter {
  const adapter = buildAdapter(platform, config);
  if (blogPublishingEnabled()) return adapter;
  // Publishing is off: reads (list, health check, product facts) still work;
  // creating or updating an article is refused before any request is sent.
  return Object.assign(Object.create(adapter) as CmsAdapter, {
    publish: async () => {
      throw new Error(BLOG_PUBLISHING_OFF);
    },
    update: async () => {
      throw new Error(BLOG_PUBLISHING_OFF);
    },
  });
}

function buildAdapter(platform: CmsPlatform, config: unknown): CmsAdapter {
  switch (platform) {
    case "shopify":
      return new ShopifyAdapter(config as ShopifyConfig);
    // case "wordpress": return new WordPressAdapter(config as any);
    // case "webflow":   return new WebflowAdapter(config as any);
    default:
      throw new Error(`No CMS adapter registered for platform: ${platform}`);
  }
}

export * from "./types";
export { BLOG_PUBLISHING_OFF, blogPublishingEnabled } from "./publishing";

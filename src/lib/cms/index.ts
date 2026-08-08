// Adapter registry — resolve the right CMS adapter for a business.
// This is the single place the rest of the app asks "how do I publish for this business?"

import type { CmsAdapter, CmsPlatform } from "./types";
import { ShopifyAdapter } from "./shopify";

/**
 * @param platform  business.cmsPlatform
 * @param config    decrypted Connector.configEnc for the publishing connector
 */
export function getCmsAdapter(platform: CmsPlatform, config: unknown): CmsAdapter {
  switch (platform) {
    case "shopify":
      return new ShopifyAdapter(config as any);
    // case "wordpress": return new WordPressAdapter(config as any);
    // case "webflow":   return new WebflowAdapter(config as any);
    default:
      throw new Error(`No CMS adapter registered for platform: ${platform}`);
  }
}

export * from "./types";

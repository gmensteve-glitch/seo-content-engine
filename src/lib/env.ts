// Capability flags — which external services are configured in this environment.
// The agents/connectors call these to degrade gracefully: when a key is absent
// they fall back to deterministic offline output instead of throwing, so the
// whole pipeline can run locally with zero credentials.

export const aiEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY);
export const firecrawlEnabled = () => Boolean(process.env.FIRECRAWL_API_KEY);
export const dataforseoEnabled = () =>
  Boolean(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD);
export const mapsEnabled = () => Boolean(process.env.GOOGLE_MAPS_API_KEY);
export const gscEnabled = () =>
  Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON && process.env.GSC_SITE_URL);
export const unsplashEnabled = () => Boolean(process.env.UNSPLASH_ACCESS_KEY);
export const inngestEnabled = () => Boolean(process.env.INNGEST_EVENT_KEY);
export const encryptionEnabled = () => Boolean(process.env.CONNECTOR_ENCRYPTION_KEY);

// Field definitions for the in-app "Connect" flow — what credentials each
// connector needs. Pure data (no server-only imports) so the client modal and
// the server action can both import it. Only connector types that map to the
// Prisma ConnectorType enum are storable; Firecrawl is env-only and omitted.

export type ConnectableType = "SHOPIFY" | "GSC" | "GA4" | "DATAFORSEO" | "GOOGLE_MAPS";

export interface ConnectorField {
  name: string;
  label: string;
  type: "text" | "password";
  placeholder?: string;
  required?: boolean;
  help?: string;
}

export interface ConnectorSpec {
  /** True when providing this makes the engine act on it immediately end-to-end
   *  (Shopify publishing). False = credentials are stored for the engine to use
   *  as it reads that source. */
  wired: boolean;
  note?: string;
  fields: ConnectorField[];
}

export const CONNECTOR_SPECS: Record<ConnectableType, ConnectorSpec> = {
  SHOPIFY: {
    wired: true,
    note: "Create a custom app in Shopify admin with read/write_content scope, then paste its Admin API access token. This is your publish target — the engine posts and updates articles here.",
    fields: [
      { name: "storeDomain", label: "Store domain", type: "text", placeholder: "your-store.myshopify.com", required: true },
      { name: "adminAccessToken", label: "Admin API access token", type: "password", placeholder: "shpat_…", required: true },
      { name: "blogHandle", label: "Blog handle (optional)", type: "text", placeholder: "news — leave blank for your first blog" },
    ],
  },
  GSC: {
    wired: false,
    note: "Grant the shared Google service account access to this property in Search Console, then enter the property exactly as GSC shows it.",
    fields: [{ name: "siteUrl", label: "Property", type: "text", placeholder: "sc-domain:example.com", required: true }],
  },
  GA4: {
    wired: false,
    note: "Optional — used for conversion signals once wired.",
    fields: [{ name: "propertyId", label: "GA4 property ID", type: "text", placeholder: "properties/123456789", required: true }],
  },
  DATAFORSEO: {
    wired: false,
    note: "Pay-as-you-go keyword + SERP data. Your DataForSEO API login and password.",
    fields: [
      { name: "login", label: "API login (email)", type: "text", placeholder: "you@example.com", required: true },
      { name: "password", label: "API password", type: "password", required: true },
    ],
  },
  GOOGLE_MAPS: {
    wired: false,
    note: "Used for local/geo pages.",
    fields: [{ name: "apiKey", label: "API key", type: "password", placeholder: "AIza…", required: true }],
  },
};

export function isConnectable(type: string): type is ConnectableType {
  return type in CONNECTOR_SPECS;
}

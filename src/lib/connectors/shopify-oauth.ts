// Shopify OAuth (authorization-code grant) — lets a store connect by approving
// once in Shopify, instead of hand-creating an Admin API token. The app's
// Client ID + Secret come from env (one app serves every store); the resulting
// offline access token is stored in that store's Connector row.
//
// Env:
//   SHOPIFY_APP_CLIENT_ID      — the app's Client ID (a.k.a. API key)
//   SHOPIFY_APP_CLIENT_SECRET  — the app's Client secret
//   SHOPIFY_APP_SCOPES         — optional, defaults to read_content,write_content
//   APP_BASE_URL               — optional, the dashboard's public origin (else derived from the request)

import crypto from "node:crypto";

export const SHOPIFY_OAUTH_COOKIE = "shopify_oauth";
export const SHOPIFY_SCOPES = process.env.SHOPIFY_APP_SCOPES || "read_content,write_content";

export function shopifyOAuthEnabled(): boolean {
  return Boolean(process.env.SHOPIFY_APP_CLIENT_ID && process.env.SHOPIFY_APP_CLIENT_SECRET);
}

export function shopifyClientId(): string {
  return process.env.SHOPIFY_APP_CLIENT_ID ?? "";
}
export function shopifyClientSecret(): string {
  return process.env.SHOPIFY_APP_CLIENT_SECRET ?? "";
}

/** Only real *.myshopify.com admin domains — never a custom storefront domain. */
export function isValidShopDomain(shop: string): boolean {
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop);
}

/** Coerce user input ("mystore", "https://mystore.myshopify.com/") to a clean
 *  "mystore.myshopify.com", or null if it can't be a valid shop domain. */
export function normalizeShop(input: string): string | null {
  let s = (input || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!s) return null;
  if (!s.includes(".")) s = `${s}.myshopify.com`;
  return isValidShopDomain(s) ? s : null;
}

/** The dashboard origin used to build the OAuth redirect URI. */
export function appBaseUrl(req: Request): string {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace(/\/+$/, "");
  const h = req.headers;
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  return `${proto}://${host}`;
}

export function callbackUrl(req: Request): string {
  return `${appBaseUrl(req)}/api/shopify/oauth/callback`;
}

export function buildAuthorizeUrl(shop: string, redirectUri: string, state: string): string {
  const p = new URLSearchParams({
    client_id: shopifyClientId(),
    scope: SHOPIFY_SCOPES,
    redirect_uri: redirectUri,
    state,
  });
  return `https://${shop}/admin/oauth/authorize?${p.toString()}`;
}

/** Verify Shopify's HMAC signature on the OAuth callback params. */
export function verifyHmac(params: URLSearchParams): boolean {
  const hmac = params.get("hmac");
  if (!hmac) return false;
  const message = [...params.entries()]
    .filter(([k]) => k !== "hmac" && k !== "signature")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const digest = crypto.createHmac("sha256", shopifyClientSecret()).update(message).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(digest, "utf8"), Buffer.from(hmac, "utf8"));
  } catch {
    return false;
  }
}

/** Exchange the authorization code for a long-lived (offline) Admin API token. */
export async function exchangeToken(shop: string, code: string): Promise<string> {
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: shopifyClientId(),
      client_secret: shopifyClientSecret(),
      code,
    }),
  });
  if (!res.ok) throw new Error(`Shopify token exchange failed — HTTP ${res.status}`);
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("Shopify token exchange returned no access_token");
  return data.access_token;
}

// Finish Shopify OAuth: verify the CSRF state + HMAC, exchange the code for a
// long-lived Admin API token, and save it into the target store's Connector row
// (encrypted). Then send the operator back to Connectors with a status.
import { NextResponse } from "next/server";
import { saveConnector } from "@/lib/pipeline/service";
import {
  shopifyOAuthEnabled,
  isValidShopDomain,
  verifyHmac,
  exchangeToken,
  SHOPIFY_OAUTH_COOKIE,
} from "@/lib/connectors/shopify-oauth";

export const dynamic = "force-dynamic";

function back(origin: string, status: string): Response {
  return NextResponse.redirect(new URL(`/connectors?${status}`, origin));
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const origin = url.origin;
  if (!shopifyOAuthEnabled()) return back(origin, "shopify_error=not_configured");

  const params = url.searchParams;
  const shop = params.get("shop") ?? "";
  const code = params.get("code") ?? "";
  const state = params.get("state") ?? "";

  // Recover the flow context we stashed at start.
  let ctx: { state?: string; shop?: string; businessId?: string } = {};
  const raw = req.headers.get("cookie") ?? "";
  const match = raw.match(new RegExp(`${SHOPIFY_OAUTH_COOKIE}=([^;]+)`));
  if (match) {
    try {
      ctx = JSON.parse(decodeURIComponent(match[1]));
    } catch {
      /* ignore */
    }
  }

  const clearCookie = (res: Response) => {
    (res as NextResponse).cookies.set(SHOPIFY_OAUTH_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  };

  // Validate everything before trusting the callback.
  if (
    !code ||
    !isValidShopDomain(shop) ||
    !state ||
    state !== ctx.state ||
    shop !== ctx.shop ||
    !ctx.businessId ||
    !verifyHmac(params)
  ) {
    return clearCookie(back(origin, "shopify_error=verify"));
  }

  try {
    const token = await exchangeToken(shop, code);
    await saveConnector(ctx.businessId, "SHOPIFY", { storeDomain: shop, adminAccessToken: token });
    return clearCookie(back(origin, "connected=shopify"));
  } catch (e) {
    console.error("[shopify-oauth] callback failed:", e instanceof Error ? e.message : e);
    return clearCookie(back(origin, "shopify_error=exchange"));
  }
}

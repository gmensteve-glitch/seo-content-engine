// Begin Shopify OAuth: validate the shop, remember the target store + a CSRF
// state in a short-lived cookie, and redirect the merchant to Shopify's consent
// screen. On approval Shopify sends them to /api/shopify/oauth/callback.
import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { activeBizId } from "@/lib/active-business";
import { connectShopifyWithAppCredentials } from "@/lib/pipeline/service";
import {
  shopifyOAuthEnabled,
  normalizeShop,
  buildAuthorizeUrl,
  callbackUrl,
  appBaseUrl,
  SHOPIFY_OAUTH_COOKIE,
} from "@/lib/connectors/shopify-oauth";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const back = "/connectors";
  if (!shopifyOAuthEnabled()) {
    return NextResponse.redirect(new URL(`${back}?shopify_error=not_configured`, appBaseUrl(req)));
  }
  const shop = normalizeShop(url.searchParams.get("shop") ?? "");
  if (!shop) {
    return NextResponse.redirect(new URL(`${back}?shopify_error=domain`, appBaseUrl(req)));
  }

  const businessId = await activeBizId();

  // Preferred path: the client-credentials grant. A Dev Dashboard app that's
  // installed on the store gets its token directly from the app's Client ID +
  // Secret — no consent screen (which Dev Dashboard apps reject with
  // "Unauthorized Access"). The token is validated before it's stored.
  if (url.searchParams.get("legacy") !== "1") {
    try {
      await connectShopifyWithAppCredentials(businessId, shop);
      return NextResponse.redirect(new URL(`${back}?connected=shopify`, appBaseUrl(req)));
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      console.error("[shopify] app-credentials connect failed:", detail);
      const q = new URLSearchParams({ shopify_error: "credentials", detail: detail.slice(0, 300) });
      return NextResponse.redirect(new URL(`${back}?${q.toString()}`, appBaseUrl(req)));
    }
  }

  // Legacy path (?legacy=1): the browser OAuth consent flow, for apps that
  // support it.
  const state = crypto.randomUUID();
  const redirectUri = callbackUrl(req);

  const res = NextResponse.redirect(buildAuthorizeUrl(shop, redirectUri, state));
  res.cookies.set(SHOPIFY_OAUTH_COOKIE, JSON.stringify({ state, shop, businessId }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 minutes to complete the flow
  });
  return res;
}

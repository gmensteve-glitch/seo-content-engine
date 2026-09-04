// Begin Shopify OAuth: validate the shop, remember the target store + a CSRF
// state in a short-lived cookie, and redirect the merchant to Shopify's consent
// screen. On approval Shopify sends them to /api/shopify/oauth/callback.
import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { activeBizId } from "@/lib/active-business";
import {
  shopifyOAuthEnabled,
  normalizeShop,
  buildAuthorizeUrl,
  callbackUrl,
  SHOPIFY_OAUTH_COOKIE,
} from "@/lib/connectors/shopify-oauth";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const back = "/connectors";
  if (!shopifyOAuthEnabled()) {
    return NextResponse.redirect(new URL(`${back}?shopify_error=not_configured`, url.origin));
  }
  const shop = normalizeShop(url.searchParams.get("shop") ?? "");
  if (!shop) {
    return NextResponse.redirect(new URL(`${back}?shopify_error=domain`, url.origin));
  }

  const businessId = await activeBizId();
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

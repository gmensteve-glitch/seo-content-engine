// Decrypt a store's CMS connector config, refreshing a short-lived Shopify
// token when needed. Shared by the pipeline service and the live-post reader.

import { prisma } from "@/lib/db";
import { clientCredentialsToken } from "@/lib/connectors/shopify-oauth";
import { decryptJson, encryptJson } from "@/lib/crypto/secrets";
import type { ConnectorType } from "@prisma/client";

/**
 * Decrypt a CMS connector's config for API use. For a client-credentials Shopify
 * connection the token only lives ~24h, so refresh it when it's within 10 min of
 * expiry (or already expired) and persist the new one — callers always get a
 * working token without knowing how it was obtained.
 */
export async function freshCmsConfig(connector: {
  id: string;
  type: ConnectorType;
  configEnc: string;
}): Promise<Record<string, unknown>> {
  const config = decryptJson(connector.configEnc) as Record<string, unknown>;
  if (connector.type !== "SHOPIFY" || config.authMode !== "client_credentials") return config;

  const expiresAt = typeof config.tokenExpiresAt === "number" ? config.tokenExpiresAt : 0;
  if (Date.now() < expiresAt - 10 * 60 * 1000) return config;

  const shop = String(config.storeDomain ?? "");
  const own =
    typeof config.appClientId === "string" && typeof config.appClientSecret === "string"
      ? { clientId: config.appClientId, clientSecret: config.appClientSecret }
      : null;
  const { accessToken, expiresAt: nextExpiry } = await clientCredentialsToken(shop, own);
  const next = { ...config, adminAccessToken: accessToken, tokenExpiresAt: nextExpiry };
  await prisma.connector
    .update({
      where: { id: connector.id },
      data: { configEnc: encryptJson(next), status: "CONNECTED", lastSyncAt: new Date() },
    })
    .catch((e) => console.error("[shopify] failed to persist refreshed token:", e));
  return next;
}

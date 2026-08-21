// Google service-account auth — mints a short-lived access token from a service
// account JSON key using the signed-JWT grant, with zero external dependencies
// (Node's crypto signs the RS256 assertion). Tokens are cached in-memory until
// shortly before they expire, so we mint at most one per hour per scope.
//
// Setup: create a Google Cloud service account, enable the "Google Search
// Console API", then add the service account's email as a user on the Search
// Console property. Paste the downloaded JSON key into the GOOGLE_SERVICE_ACCOUNT_JSON
// env var (as a single line). No OAuth redirect flow, no refresh tokens to babysit.

import { createSign } from "node:crypto";

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

const TOKEN_URI = "https://oauth2.googleapis.com/token";

function loadKey(): ServiceAccountKey | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ServiceAccountKey;
    if (!parsed.client_email || !parsed.private_key) return null;
    // Railway/env stores newlines as literal "\n" — restore them for the PEM.
    parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
    return parsed;
  } catch {
    return null;
  }
}

/** True when a usable service-account key is configured. */
export function googleServiceAccountEnabled(): boolean {
  return loadKey() !== null;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

// Cache: scope → { token, expEpochMs }.
const cache = new Map<string, { token: string; exp: number }>();

/**
 * Get an OAuth access token for the given scope via the service-account JWT grant.
 * Returns null when no key is configured (callers degrade gracefully).
 */
export async function getGoogleAccessToken(scope: string): Promise<string | null> {
  const key = loadKey();
  if (!key) return null;

  const cached = cache.get(scope);
  // Reuse until 60s before expiry.
  if (cached && cached.exp - 60_000 > Date.now()) return cached.token;

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(
    JSON.stringify({
      iss: key.client_email,
      scope,
      aud: key.token_uri || TOKEN_URI,
      iat: now,
      exp: now + 3600,
    }),
  );
  const signingInput = `${header}.${claim}`;
  const signature = createSign("RSA-SHA256")
    .update(signingInput)
    .sign(key.private_key, "base64url");
  const assertion = `${signingInput}.${signature}`;

  const res = await fetch(key.token_uri || TOKEN_URI, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Google token exchange → HTTP ${res.status} ${detail.slice(0, 200)}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cache.set(scope, {
    token: data.access_token,
    exp: Date.now() + data.expires_in * 1000,
  });
  return data.access_token;
}

/** Read-only Search Console scope. */
export const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

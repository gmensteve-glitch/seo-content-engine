"use client";

import { useState } from "react";
import { ShoppingBag, ArrowRight } from "lucide-react";

/**
 * One-click Shopify connect: the operator enters the store's myshopify.com
 * handle and the dashboard fetches a token with the app's own credentials (the
 * client-credentials grant) — no Admin API token to create or paste.
 *
 * A second store lives in its own Shopify organization, so the env-wide app
 * can't see it. "This store has its own app" reveals two fields for that
 * store's Dev Dashboard app; they're POSTed (never put in a URL) and stored
 * encrypted with the connector.
 */
export function ShopifyOAuthConnect({ compact = false }: { compact?: boolean }) {
  const [shop, setShop] = useState("");
  const [ownApp, setOwnApp] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function domainOf(): string | null {
    const s = shop.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    const domain = s.includes(".") ? s : `${s}.myshopify.com`;
    return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(domain) ? domain : null;
  }

  function go() {
    const domain = domainOf();
    if (!domain) {
      setError("Enter the store's myshopify.com domain (e.g. your-store.myshopify.com).");
      return;
    }
    // Full navigation: this API route 302-redirects, which a client-side
    // router push cannot follow.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `/api/shopify/oauth/start?shop=${encodeURIComponent(domain)}`;
  }

  return (
    <div className={compact ? "" : "rounded-lg border border-[var(--accent)] bg-[var(--accent-bg)] p-3"}>
      {!compact && (
        <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium text-[var(--accent)]">
          <ShoppingBag size={13} /> Connect with Shopify (recommended)
        </div>
      )}
      {ownApp ? (
        <form
          method="post"
          action="/api/shopify/oauth/start"
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            if (!domainOf()) {
              e.preventDefault();
              setError("Enter the store's myshopify.com domain (e.g. your-store.myshopify.com).");
            }
          }}
        >
          <input
            name="shop"
            value={shop}
            onChange={(e) => {
              setShop(e.target.value);
              setError(null);
            }}
            placeholder="your-store.myshopify.com"
            className="w-full rounded-md border border-[var(--border-strong)] bg-[var(--surface-0)] px-2.5 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]"
          />
          <div className="flex flex-wrap gap-2">
            <input
              name="client_id"
              required
              placeholder="App client ID"
              autoComplete="off"
              className="min-w-[180px] flex-1 rounded-md border border-[var(--border-strong)] bg-[var(--surface-0)] px-2.5 py-1.5 font-mono text-[12.5px] outline-none focus:border-[var(--accent)]"
            />
            <input
              name="client_secret"
              type="password"
              required
              placeholder="App client secret"
              autoComplete="off"
              className="min-w-[180px] flex-1 rounded-md border border-[var(--border-strong)] bg-[var(--surface-0)] px-2.5 py-1.5 font-mono text-[12.5px] outline-none focus:border-[var(--accent)]"
            />
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 py-1.5 text-[12px] font-medium text-white hover:opacity-90"
            >
              Connect <ArrowRight size={13} />
            </button>
          </div>
          <p className="text-[11px] text-[var(--muted)]">
            From this store&apos;s Shopify admin: Settings → Apps and sales channels → Develop apps (Dev Dashboard) → the app →
            Client credentials. The app must be installed on this store.{" "}
            <button type="button" onClick={() => setOwnApp(false)} className="underline">
              Use the shared app instead
            </button>
          </p>
        </form>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={shop}
              onChange={(e) => {
                setShop(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && go()}
              placeholder="your-store.myshopify.com"
              className="min-w-[220px] flex-1 rounded-md border border-[var(--border-strong)] bg-[var(--surface-0)] px-2.5 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]"
            />
            <button
              onClick={go}
              className="flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 py-1.5 text-[12px] font-medium text-white hover:opacity-90"
            >
              Connect with Shopify <ArrowRight size={13} />
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-[var(--muted)]">
            {!compact && "Uses the dashboard's Shopify app — no Admin API token to create or paste. "}
            <button type="button" onClick={() => setOwnApp(true)} className="underline">
              This store has its own app
            </button>
          </p>
        </>
      )}
      {error && <p className="mt-1 text-[11px] text-[var(--danger)]">{error}</p>}
    </div>
  );
}

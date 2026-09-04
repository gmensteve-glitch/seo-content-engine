"use client";

import { useState } from "react";
import { ShoppingBag, ArrowRight } from "lucide-react";

/**
 * One-click Shopify connect via OAuth: the operator enters the store's
 * myshopify.com domain and approves once in Shopify — the token is captured and
 * stored automatically (no hand-created Admin API token). Renders only when the
 * app's OAuth credentials are configured.
 */
export function ShopifyOAuthConnect({ compact = false }: { compact?: boolean }) {
  const [shop, setShop] = useState("");
  const [error, setError] = useState<string | null>(null);

  function go() {
    const s = shop.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    const domain = s.includes(".") ? s : `${s}.myshopify.com`;
    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(domain)) {
      setError("Enter the store's myshopify.com domain (e.g. your-store.myshopify.com).");
      return;
    }
    // Full navigation: this API route 302-redirects off-site to Shopify's
    // consent screen, which a client-side router push cannot follow.
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
      {!compact && (
        <p className="mt-1.5 text-[11px] text-[var(--muted)]">
          You&apos;ll approve access once in Shopify — no Admin API token to create or paste.
        </p>
      )}
      {error && <p className="mt-1 text-[11px] text-[var(--danger)]">{error}</p>}
    </div>
  );
}

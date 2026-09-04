import { Shell } from "@/components/shell";
import { PageHeader, Card, Pill } from "@/components/ui";
import { getConnectors, getBusiness } from "@/lib/data/repo";
import { ConnectorControls } from "@/components/connect-modal";
import { ShopifyOAuthConnect } from "@/components/shopify-oauth-connect";
import { shopifyOAuthEnabled } from "@/lib/connectors/shopify-oauth";
import { CheckCircle2, Circle, AlertTriangle, ShoppingBag } from "lucide-react";

export const dynamic = "force-dynamic";

const SHOPIFY_ERROR: Record<string, string> = {
  domain: "That wasn't a valid myshopify.com domain — enter the store's .myshopify.com admin domain.",
  verify: "Couldn't verify the response from Shopify. Please try connecting again.",
  exchange: "Shopify approved, but the token exchange failed. Try again.",
  not_configured: "Shopify OAuth isn't configured on the server yet (missing app credentials).",
};

export default async function ConnectorsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; shopify_error?: string }>;
}) {
  const sp = await searchParams;
  const [connectors, biz] = await Promise.all([getConnectors(), getBusiness()]);
  const oauth = shopifyOAuthEnabled();
  const shopifyConnected = connectors.find((c) => c.type === "SHOPIFY")?.status === "connected";

  return (
    <Shell>
      <PageHeader
        title="Connectors"
        subtitle="Data in (GSC, DataForSEO, GA4, Maps, Firecrawl) and publishing out (Shopify). Secrets stored encrypted."
      />

      {sp.connected === "shopify" && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-[var(--success)] bg-[var(--success-bg)] px-4 py-2.5 text-[13px] text-[var(--success)]">
          <CheckCircle2 size={16} /> Shopify connected — {biz.name} can now publish.
        </div>
      )}
      {sp.shopify_error && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-[var(--danger)] bg-[var(--danger-bg)] px-4 py-2.5 text-[13px] text-[var(--danger)]">
          <AlertTriangle size={16} /> {SHOPIFY_ERROR[sp.shopify_error] ?? "Shopify connection failed."}
        </div>
      )}

      {/* One-click Shopify connect via OAuth — the recommended path when the app
          credentials are configured. */}
      {oauth && !shopifyConnected && (
        <Card className="mb-4">
          <div className="mb-2 flex items-center gap-2">
            <ShoppingBag size={16} className="text-[var(--accent)]" />
            <h2 className="text-[15px] font-medium">Connect {biz.name} to Shopify</h2>
          </div>
          <p className="mb-3 text-[12px] text-[var(--muted)]">
            Approve once in Shopify — no Admin API token to create or paste. The engine publishes to
            this store&apos;s blog.
          </p>
          <ShopifyOAuthConnect />
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {connectors.map((c) => (
          <Card key={c.type} className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                {c.status === "connected" ? (
                  <CheckCircle2 size={16} className="text-[var(--success)]" />
                ) : c.status === "error" ? (
                  <AlertTriangle size={16} className="text-[var(--danger)]" />
                ) : (
                  <Circle size={16} className="text-[var(--subtle)]" />
                )}
                <span className="text-[14px] font-medium">{c.label}</span>
              </div>
              <p className="mt-1 pl-6 text-[12px] text-[var(--muted)]">{c.detail}</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <Pill
                tone={
                  c.status === "connected" ? "success" : c.status === "error" ? "danger" : "neutral"
                }
              >
                {c.status}
              </Pill>
              <ConnectorControls connector={c} />
            </div>
          </Card>
        ))}
      </div>
    </Shell>
  );
}

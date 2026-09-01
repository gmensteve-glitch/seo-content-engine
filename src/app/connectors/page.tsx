import { Shell } from "@/components/shell";
import { PageHeader, Card, Pill } from "@/components/ui";
import { getConnectors } from "@/lib/data/repo";
import { ConnectorControls } from "@/components/connect-modal";
import { CheckCircle2, Circle, AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ConnectorsPage() {
  const connectors = await getConnectors();

  return (
    <Shell>
      <PageHeader
        title="Connectors"
        subtitle="Data in (GSC, DataForSEO, GA4, Maps, Firecrawl) and publishing out (Shopify). Secrets stored encrypted."
      />
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

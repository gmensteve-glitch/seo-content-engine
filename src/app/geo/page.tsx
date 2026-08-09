import { Shell } from "@/components/shell";
import { PageHeader, Card, Pill } from "@/components/ui";
import { MapPin } from "lucide-react";

const SAMPLE_CITIES = [
  "Austin, TX",
  "Phoenix, AZ",
  "Columbus, OH",
  "Charlotte, NC",
  "Nashville, TN",
  "Denver, CO",
];

export default async function GeoPage() {
  return (
    <Shell>
      <PageHeader
        title="Geo campaigns"
        subtitle="One template → thousands of unique city pages. Pulls vetted local data (Maps, ≥4.4★ / ≥20 reviews)."
      />

      <Card className="mb-4">
        <h2 className="text-[15px] font-medium">Casket resource pages</h2>
        <p className="mt-1 text-[13px] text-[var(--muted)]">
          “When a loved one passes in [City]: first steps, vetted local funeral homes, and what to
          expect.” Be the helpful authority in a moment of real need — a soft CTA does the rest.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <Pill tone="accent">geo template ready</Pill>
          <span className="text-[12px] text-[var(--subtle)]">target: top 300 US cities</span>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 text-[15px] font-medium">Sample campaign cities</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {SAMPLE_CITIES.map((c) => (
            <div
              key={c}
              className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-[13px]"
            >
              <MapPin size={14} className="text-[var(--accent)]" />
              {c}
            </div>
          ))}
        </div>
      </Card>
    </Shell>
  );
}

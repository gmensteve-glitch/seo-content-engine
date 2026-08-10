import { Shell } from "@/components/shell";
import { PageHeader, Card, Pill } from "@/components/ui";
import { getLivePages } from "@/lib/data/repo";
import { BarChart3, TrendingUp, PenLine } from "lucide-react";

const FLAG_TONE = {
  boost: "warn",
  rewrite: "warn",
  decaying: "danger",
  healthy: "success",
} as const;

export const dynamic = "force-dynamic";

export default async function PerformancePage() {
  const pages = await getLivePages();

  return (
    <Shell>
      <PageHeader
        title="Performance"
        subtitle="Results from Google Search Console + GA4. The engine turns these signals into improvement tasks."
      />

      <Card className="mb-4">
        <div className="flex items-center gap-2 text-[13px] text-[var(--muted)]">
          <BarChart3 size={16} className="text-[var(--accent)]" />
          <span>
            Embedded Looker Studio report goes here (GSC + GA4) — we plug in the free report rather
            than rebuilding analytics.
          </span>
        </div>
        <div className="mt-3 flex h-40 items-center justify-center rounded-lg border border-dashed border-[var(--border)] text-[12px] text-[var(--subtle)]">
          Looker Studio embed placeholder
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 text-[15px] font-medium">Pages &amp; signals</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="text-[11px] uppercase tracking-wide text-[var(--subtle)]">
              <tr className="border-b border-[var(--border)]">
                <th className="pb-2 pr-4 font-medium">Page</th>
                <th className="pb-2 pr-4 font-medium">Pos.</th>
                <th className="pb-2 pr-4 font-medium">CTR</th>
                <th className="pb-2 pr-4 font-medium">Clicks 28d</th>
                <th className="pb-2 font-medium">Signal</th>
              </tr>
            </thead>
            <tbody>
              {pages.map((p) => (
                <tr key={p.id} className="border-b border-[var(--border)] last:border-0">
                  <td className="py-2.5 pr-4">
                    <div className="font-medium">{p.title}</div>
                    <div className="text-[11px] text-[var(--subtle)]">{p.url}</div>
                  </td>
                  <td className="py-2.5 pr-4">{p.position ?? "—"}</td>
                  <td className="py-2.5 pr-4">{p.ctr != null ? `${p.ctr}%` : "—"}</td>
                  <td className="py-2.5 pr-4">{p.clicks28d ?? "—"}</td>
                  <td className="py-2.5">
                    {p.flag && (
                      <Pill tone={FLAG_TONE[p.flag]}>
                        {p.flag === "boost" && <TrendingUp size={11} className="mr-1 inline align-middle" />}
                        {p.flag === "rewrite" && <PenLine size={11} className="mr-1 inline align-middle" />}
                        {p.flag}
                      </Pill>
                    )}
                  </td>
                </tr>
              ))}
              {pages.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-[12px] text-[var(--subtle)]">
                    No live pages yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </Shell>
  );
}

import { Shell } from "@/components/shell";
import { PageHeader, Card, Bar, Pill } from "@/components/ui";
import { getLatestScorecard } from "@/lib/data/repo";
import { MessageSquare } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function QualityPage() {
  const sc = await getLatestScorecard();
  const hasData = sc.dimensions.length > 0;

  return (
    <Shell>
      <PageHeader
        title="Quality grader"
        subtitle="Every draft is scored 0–100. Below threshold, it revises its weakest parts and re-grades."
      />

      {!hasData ? (
        <Card>
          <p className="text-[13px] text-[var(--muted)]">{sc.feedback}</p>
        </Card>
      ) : (
        <Card className="max-w-2xl">
          <div className="text-[13px] text-[var(--muted)]">Latest draft</div>
          <div className="text-[15px] font-medium">{sc.draftTitle}</div>

          <div className="my-4 flex items-baseline gap-3">
            <span className="text-[48px] font-semibold leading-none text-[var(--success)]">
              {sc.overall}
            </span>
            <span className="text-[13px] text-[var(--muted)]">
              / 100 · {sc.passed ? "passed" : "below"} threshold ({sc.threshold}) · loop {sc.loop} · queued
            </span>
          </div>

          <div className="space-y-2.5">
            {sc.dimensions.map((d) => {
              const pct = (d.score / d.max) * 100;
              const tone = pct >= 85 ? "success" : pct >= 70 ? "warn" : "danger";
              return (
                <div key={d.key}>
                  <div className="flex items-center gap-3">
                    <span className="w-40 shrink-0 text-[12px] text-[var(--muted)]">{d.label}</span>
                    <Bar pct={pct} tone={tone} />
                    <span className="w-12 shrink-0 text-right text-[12px] text-[var(--muted)]">
                      {d.score}/{d.max}
                    </span>
                  </div>
                  <p className="ml-40 pl-3 text-[11px] text-[var(--subtle)]">{d.note}</p>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex items-start gap-2 rounded-lg bg-[var(--warn-bg)] px-3 py-2.5">
            <MessageSquare size={15} className="mt-0.5 shrink-0 text-[var(--warn)]" />
            <p className="text-[12.5px] text-[var(--warn)]">
              <span className="font-medium">Learn: </span>
              {sc.feedback}
            </p>
          </div>
        </Card>
      )}
    </Shell>
  );
}
